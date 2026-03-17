"""
Role Enrichment — EthCC Cannes Speakers

Calls Apollo People Match API to fetch each speaker's title,
then normalizes into:
  - role:      Normalized role (CEO, CTO, Founder, etc.)
  - role_type: Executive / Technical / Business / Security
  - role_2:    Co-Founder / Founder / na

Reads/writes: enriched_speakers.csv
Uses apollo_role_cache.json to avoid repeat API calls.
"""

import csv
import json
import os
import re
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env.local")

APOLLO_KEY = os.getenv("APOLLO_API_KEY")
DATA_DIR   = Path(__file__).resolve().parent.parent / "data"
CSV_FILE   = DATA_DIR / "enriched_speakers.csv"
BACKUP_CSV = DATA_DIR / "enriched_speakers_role_backup.csv"
CACHE_FILE = DATA_DIR / "apollo_role_cache.json"

APOLLO_URL = "https://api.apollo.io/api/v1/people/match"
RATE_DELAY = 0.7


# ── normalization functions ──────────────────────────────────────────────────

def normalize_role(title: str) -> str:
    r = title.strip().lower()
    if not r:
        return ''
    if re.search(r'\bceo\b|chief executive officer', r):
        return 'CEO'
    if re.search(r'\bcto\b|chief technology officer|chief technical officer', r):
        return 'CTO'
    if re.search(r'chief risk officer|chief risk &', r):
        return 'Chief Risk Officer'
    if re.search(r'chief revenue officer|\bcro\b', r):
        return 'Chief Revenue Officer'
    if re.search(r'ciso|chief information security officer', r):
        return 'CISO'
    if re.search(r'\bcio\b|chief information officer', r):
        return 'CIO'
    if re.search(r'\bcoo\b|chief operating officer', r):
        return 'COO'
    if re.search(r'\bcbo\b|chief business officer|chief commercial officer|cbdo', r):
        return 'Chief Business Officer'
    if re.search(r'chief strategy officer|chief scientist', r):
        return 'Chief Strategy Officer'
    if re.search(r'\bcso\b', r):
        return 'CSO'
    if re.search(r'chief compliance', r):
        return 'Chief Compliance Officer'
    if re.search(r'vp.*engineer|vice president.*engineer|svp.*engineer|executive vp engineer', r):
        return 'VP Engineering'
    if re.search(r'vp.*product', r):
        return 'VP Product'
    if re.search(r'director.*engineer|engineering director|engineering enablement', r):
        return 'Director of Engineering'
    if re.search(r'director.*product', r):
        return 'Director of Product'
    if re.search(r'\bdirector\b', r):
        return 'Director'
    if re.search(r'\bchairman\b|\bchair\b', r):
        return 'Chairman'
    if re.search(r'\bpresident\b', r):
        return 'President'
    if re.search(r'managing director|managing partner', r):
        return 'Managing Director'
    if re.search(r'\bhead of\b', r):
        return 'Head of Department'
    if re.search(r'chief of staff', r):
        return 'Chief of Staff'
    if re.search(r'\bpartner\b', r):
        return 'Partner'
    if re.search(r'architect', r):
        return 'Architect'
    if re.search(r'product manager|product designer', r):
        return 'Product'
    if re.search(r'marketing', r):
        return 'Marketing'
    if re.search(r'analyst', r):
        return 'Analyst'
    if re.search(r'research|scientist', r):
        return 'Research'
    if re.search(r'\binvestor\b', r):
        return 'Investor'
    if re.search(r'founder|founding', r):
        return 'Founder'
    if re.search(r'engineer|developer|software', r):
        return 'Engineer'
    return 'Other'


def get_role_type(title: str) -> str:
    r = title.strip().lower()
    if not r:
        return ''
    if re.search(r'ciso|security|risk|compliance|audit', r):
        return 'Security'
    if re.search(r'cto|engineer|architect|developer|software|technical|devops|sre|infra|platform', r):
        return 'Technical'
    if re.search(r'marketing|sales|revenue|business dev|growth|commercial|partnerships|communications', r):
        return 'Business'
    # Default to Executive for C-suite, founders, directors, VPs, etc.
    return 'Executive'


def get_role2(title: str) -> str:
    r = title.strip().lower()
    if not r:
        return 'na'
    if re.search(r'co[\s-]?founder|cofounder', r):
        return 'Co-Founder'
    if re.search(r'founder|founding', r):
        return 'Founder'
    return 'na'


# ── Apollo ───────────────────────────────────────────────────────────────────

def apollo_match(name: str, org: str, linkedin_url: str | None = None) -> dict | None:
    payload = {"reveal_personal_emails": False, "reveal_phone_number": False}
    if name:
        payload["name"] = name
    if org:
        payload["organization_name"] = org
    if linkedin_url:
        payload["linkedin_url"] = linkedin_url

    headers = {"X-Api-Key": APOLLO_KEY, "Content-Type": "application/json"}

    try:
        resp = requests.post(APOLLO_URL, headers=headers, json=payload, timeout=15)
        resp.raise_for_status()
        person = resp.json().get("person")
        if person:
            return person
    except requests.RequestException as e:
        print(f"    [apollo] HTTP error for {name}: {e}")
    return None


# ── cache ────────────────────────────────────────────────────────────────────

def load_cache() -> dict:
    if CACHE_FILE.exists():
        with open(CACHE_FILE) as f:
            return json.load(f)
    return {}


def save_cache(cache: dict):
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    if not APOLLO_KEY:
        raise SystemExit("APOLLO_API_KEY not set in .env.local")

    rows = list(csv.DictReader(open(CSV_FILE, newline="", encoding="utf-8")))
    print(f"[csv] Loaded {len(rows)} speakers")

    # Backup
    with open(BACKUP_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader()
        w.writerows(rows)
    print(f"[csv] Backup written to {BACKUP_CSV}")

    cache = load_cache()
    hits = misses = cached = 0

    for i, row in enumerate(rows, 1):
        name = row["name"].strip().title()
        org  = row["org"].strip()
        cache_key = f"{name}|{org}"

        # Check cache
        if cache_key in cache:
            title = cache[cache_key] or ""
            cached += 1
            status = "CACHE" if title else "CACHE (no title)"
        else:
            # Call Apollo
            li_url = row.get("linkedin", "").strip() or None
            person = apollo_match(name, org, linkedin_url=li_url)
            if person:
                title = person.get("title") or ""
                cache[cache_key] = title
                hits += 1
                status = f"HIT: {title}" if title else "HIT (no title)"
            else:
                title = ""
                cache[cache_key] = None
                misses += 1
                status = "MISS"
            save_cache(cache)
            time.sleep(RATE_DELAY)

        print(f"  [{i:3d}/{len(rows)}] {status:50s} | {name} @ {org}")

        row["role"]      = normalize_role(title) if title else ""
        row["role_type"]  = get_role_type(title) if title else ""
        row["role_2"]     = get_role2(title) if title else "na"

    # Write enriched CSV
    original_fields = list(csv.DictReader(open(BACKUP_CSV, newline="")).fieldnames or [])
    fieldnames = original_fields + ["role", "role_type", "role_2"]

    with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    # Summary
    from collections import Counter
    role_counts = Counter(r["role"] for r in rows if r["role"])
    role2_counts = Counter(r["role_2"] for r in rows)
    type_counts = Counter(r["role_type"] for r in rows if r["role_type"])

    print(f"\n✓ Done — Apollo hits: {hits} | misses: {misses} | cached: {cached}")
    print(f"\n=== Role distribution ===")
    for role, c in sorted(role_counts.items(), key=lambda x: -x[1]):
        print(f"  {c:3d}  {role}")
    print(f"\n=== Role Type distribution ===")
    for rt, c in sorted(type_counts.items(), key=lambda x: -x[1]):
        print(f"  {c:3d}  {rt}")
    print(f"\n=== Role 2 distribution ===")
    for r2, c in sorted(role2_counts.items(), key=lambda x: -x[1]):
        print(f"  {c:3d}  {r2}")
    print(f"\nWritten to {CSV_FILE}")


if __name__ == "__main__":
    main()
