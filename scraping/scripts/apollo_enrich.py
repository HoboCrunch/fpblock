"""
Apollo Contact Enrichment — EthCC Cannes Speakers

For each speaker, calls Apollo People Match API to find:
  - email address
  - LinkedIn URL (when only Twitter exists)
  - Twitter/X handle (when only LinkedIn exists)
  - phone number

Reads:  enriched_speakers.csv
Writes: enriched_speakers.csv (adds/fills columns: twitter, linkedin, email, phone)

Apollo credits: one per successful match. Skips fields that are already populated.
"""

import csv
import json
import os
import re
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(".env.local")

APOLLO_KEY  = os.getenv("APOLLO_API_KEY")
INPUT_CSV   = "enriched_speakers.csv"
OUTPUT_CSV  = "enriched_speakers.csv"   # overwrite in-place
BACKUP_CSV  = "enriched_speakers_backup.csv"
CACHE_FILE  = "apollo_cache.json"        # avoid re-hitting for already-tried names

APOLLO_URL  = "https://api.apollo.io/api/v1/people/match"
RATE_DELAY  = 0.7   # seconds between calls — keeps us well under 100 req/min


# ── helpers ──────────────────────────────────────────────────────────────────

def extract_twitter(url: str) -> str | None:
    """Return bare handle (no @) from a twitter.com or x.com URL."""
    if not url:
        return None
    m = re.search(r"(?:twitter\.com|x\.com)/([A-Za-z0-9_]+)", url)
    if m:
        h = m.group(1)
        if h.lower() in {"home", "search", "explore", "notifications", "messages", "settings"}:
            return None
        return h
    return None


def extract_linkedin_slug(url: str) -> str | None:
    """Return the /in/slug from a LinkedIn URL, or None."""
    if not url:
        return None
    m = re.search(r"linkedin\.com/in/([^/?]+)", url)
    return m.group(1).rstrip("/") if m else None


def normalize_social(social: str) -> tuple[str | None, str | None]:
    """Split a single social URL into (twitter_url, linkedin_url)."""
    if not social:
        return None, None
    tw = linkedin = None
    if "x.com" in social or "twitter.com" in social:
        tw = social
    elif "linkedin.com" in social:
        linkedin = social
    return tw, linkedin


def load_cache() -> dict:
    if Path(CACHE_FILE).exists():
        with open(CACHE_FILE) as f:
            return json.load(f)
    return {}


def save_cache(cache: dict):
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)


# ── Apollo call ───────────────────────────────────────────────────────────────

def apollo_match(name: str, org: str, linkedin_url: str | None = None) -> dict | None:
    """
    Call Apollo People Match.
    Returns the 'person' dict on success, None on miss/error.
    Auth via X-Api-Key header (required by Apollo's current API).
    """
    payload: dict = {
        "reveal_personal_emails": True,   # catches work + personal when available
        "reveal_phone_number":    False,  # requires webhook — skip
    }

    if name:
        payload["name"] = name
    if org:
        payload["organization_name"] = org
    if linkedin_url:
        payload["linkedin_url"] = linkedin_url

    headers = {
        "X-Api-Key":    APOLLO_KEY,
        "Content-Type": "application/json",
    }

    try:
        resp = requests.post(APOLLO_URL, headers=headers, json=payload, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as e:
        print(f"    [apollo] HTTP error for {name}: {e}")
        return None

    person = data.get("person")
    if not person:
        print(f"    [apollo] No match for {name} @ {org}")
        return None
    return person


def parse_apollo_person(person: dict) -> dict:
    """Extract the contact fields we care about from an Apollo person object."""
    result: dict = {}

    # Email — prefer work email, fall back to first available
    email = ""
    emails = person.get("email_addresses") or []
    for e in emails:
        if e.get("type") == "work" and e.get("email"):
            email = e["email"]
            break
    if not email:
        email = person.get("email") or ""
    if not email and emails:
        email = emails[0].get("email", "")
    result["email"] = email

    # LinkedIn
    li = person.get("linkedin_url") or ""
    result["linkedin"] = li

    # Twitter / X — Apollo rarely populates twitter_url, but often embeds
    # the handle in the headline (e.g. "Director @Circle | @paddi_hansen")
    tw = person.get("twitter_url") or ""
    if not tw:
        handle = person.get("twitter_username") or ""
        if handle:
            tw = f"https://x.com/{handle}"
    if not tw:
        headline = person.get("headline") or ""
        # Find @handles in headline; skip org-style handles that start with capital
        handles = re.findall(r"@([A-Za-z0-9_]{3,})", headline)
        for h in handles:
            # Rough filter: org names tend to start uppercase, personal handles lowercase
            if h[0].islower() or h[0].isdigit() or "_" in h:
                tw = f"https://x.com/{h}"
                break
    result["twitter"] = tw

    # Phone
    phones = person.get("phone_numbers") or []
    phone = phones[0].get("sanitized_number", "") if phones else ""
    result["phone"] = phone

    return result


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    if not APOLLO_KEY:
        raise SystemExit("APOLLO_API_KEY not set in .env.local")

    # Load cache (avoids repeat hits)
    cache = load_cache()

    # Read CSV
    rows = list(csv.DictReader(open(INPUT_CSV, newline="", encoding="utf-8")))
    print(f"[csv] Loaded {len(rows)} speakers from {INPUT_CSV}")

    # Back up before mutating
    with open(BACKUP_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader()
        w.writerows(rows)
    print(f"[csv] Backup written to {BACKUP_CSV}")

    # Ensure new columns exist on every row
    for row in rows:
        for col in ("twitter", "linkedin", "email", "phone"):
            if col not in row:
                row[col] = ""

    # Pre-fill twitter/linkedin from existing `social` field
    for row in rows:
        if not row["twitter"] and not row["linkedin"]:
            tw_url, li_url = normalize_social(row.get("social", ""))
            if tw_url:
                row["twitter"] = tw_url
            if li_url:
                row["linkedin"] = li_url

    # Decide which rows to enrich
    # Strategy:
    #   - Always attempt if email is missing and icp_score >= 50
    #   - Also attempt if one of twitter/linkedin is missing and icp_score >= 50
    MIN_SCORE = 50
    to_enrich = []
    for row in rows:
        score = int(row.get("icp_score") or 0)
        if score < MIN_SCORE:
            continue
        missing_email    = not row["email"].strip()
        missing_twitter  = not row["twitter"].strip()
        missing_linkedin = not row["linkedin"].strip()
        if missing_email or missing_twitter or missing_linkedin:
            to_enrich.append(row)

    print(f"[apollo] {len(to_enrich)} speakers need enrichment (score ≥ {MIN_SCORE}, missing ≥1 field)")

    hits = 0
    misses = 0

    for i, row in enumerate(to_enrich, 1):
        name = row["name"].strip().title()   # Apollo prefers title case
        org  = row["org"].strip()
        cache_key = f"{name}|{org}"

        # Skip if we already tried and got nothing
        if cache_key in cache and cache[cache_key] is None:
            print(f"  [{i}/{len(to_enrich)}] SKIP (cached miss): {name} @ {org}")
            continue

        # Use cached result if available
        if cache_key in cache and cache[cache_key]:
            print(f"  [{i}/{len(to_enrich)}] CACHE HIT: {name} @ {org}")
            apollo_data = cache[cache_key]
        else:
            print(f"  [{i}/{len(to_enrich)}] Querying Apollo: {name} @ {org}")
            li_hint = row["linkedin"] if row["linkedin"].strip() else None
            person = apollo_match(name, org, linkedin_url=li_hint)
            if person:
                apollo_data = parse_apollo_person(person)
                cache[cache_key] = apollo_data
                hits += 1
            else:
                cache[cache_key] = None
                misses += 1
                save_cache(cache)
                time.sleep(RATE_DELAY)
                continue

        # Merge into row — never overwrite existing data
        if not row["email"].strip() and apollo_data.get("email"):
            row["email"] = apollo_data["email"]
        if not row["linkedin"].strip() and apollo_data.get("linkedin"):
            row["linkedin"] = apollo_data["linkedin"]
        if not row["twitter"].strip() and apollo_data.get("twitter"):
            row["twitter"] = apollo_data["twitter"]
        if not row["phone"].strip() and apollo_data.get("phone"):
            row["phone"] = apollo_data["phone"]

        save_cache(cache)
        time.sleep(RATE_DELAY)

    # Write enriched CSV (preserve all original columns + new ones)
    original_fields = list(csv.DictReader(open(BACKUP_CSV, newline="")).fieldnames or [])
    new_fields = [f for f in ("twitter", "linkedin", "email", "phone") if f not in original_fields]
    fieldnames = original_fields + new_fields

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    # Summary
    final = list(csv.DictReader(open(OUTPUT_CSV, newline="")))
    has_email    = sum(1 for r in final if r.get("email","").strip())
    has_twitter  = sum(1 for r in final if r.get("twitter","").strip())
    has_linkedin = sum(1 for r in final if r.get("linkedin","").strip())
    has_phone    = sum(1 for r in final if r.get("phone","").strip())
    print(f"\n✓ Done")
    print(f"  Apollo hits: {hits}  |  misses: {misses}")
    print(f"  Email filled:    {has_email}/{len(final)}")
    print(f"  Twitter filled:  {has_twitter}/{len(final)}")
    print(f"  LinkedIn filled: {has_linkedin}/{len(final)}")
    print(f"  Phone filled:    {has_phone}/{len(final)}")
    print(f"  Written to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
