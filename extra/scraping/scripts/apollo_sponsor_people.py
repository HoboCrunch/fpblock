"""
Apollo Sponsor Personnel Enrichment — EthCC Cannes Sponsors

Two-phase approach:
  1. Search: find people at each sponsor company via domain search
  2. Reveal: call people/match with Apollo ID to unlock name, email, LinkedIn

Reads:  data/sponsors.csv
Writes: data/sponsor_contacts.csv
Cache:  data/apollo_sponsor_cache.json (raw search results with IDs)
        data/apollo_reveal_cache.json  (revealed contact details)

Apollo credits: 1 per reveal (search is free).
"""

import csv
import json
import os
import time
from pathlib import Path
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv

# Load env from project root
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env.local")

APOLLO_KEY = os.getenv("APOLLO_API_KEY")
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
INPUT_CSV = DATA_DIR / "sponsors.csv"
OUTPUT_CSV = DATA_DIR / "sponsor_contacts.csv"
SEARCH_CACHE = DATA_DIR / "apollo_sponsor_cache.json"
REVEAL_CACHE = DATA_DIR / "apollo_reveal_cache.json"

SEARCH_URL = "https://api.apollo.io/api/v1/mixed_people/api_search"
MATCH_URL = "https://api.apollo.io/api/v1/people/match"
RATE_DELAY = 0.7  # seconds between calls

# Target seniorities — decision-makers and key team leads
TARGET_SENIORITIES = ["founder", "c_suite", "vp", "director", "head", "manager"]

# Max people to fetch per company
MAX_PER_COMPANY = 10

# Skip venues / non-outreach targets
SKIP_NAMES = {"Marriott Cannes", "Palais des Festivals"}

HEADERS = {
    "X-Api-Key": APOLLO_KEY,
    "Content-Type": "application/json",
}


# ── helpers ──────────────────────────────────────────────────────────────────

def domain_from_url(url: str) -> str | None:
    """Extract clean domain from a URL."""
    if not url or not url.strip():
        return None
    try:
        parsed = urlparse(url if url.startswith("http") else f"https://{url}")
        domain = parsed.netloc or parsed.path
        domain = domain.lower().strip("/")
        if domain.startswith("www."):
            domain = domain[4:]
        return domain if domain else None
    except Exception:
        return None


def load_json(path: Path) -> dict:
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {}


def save_json(path: Path, data: dict):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


# ── Phase 1: Search ─────────────────────────────────────────────────────────

def search_people(domain: str, org_name: str) -> list[dict] | None:
    """Search Apollo for people at a company. Returns raw person stubs with IDs."""
    payload = {
        "per_page": MAX_PER_COMPANY,
        "page": 1,
        "person_seniorities": TARGET_SENIORITIES,
    }
    if domain:
        payload["q_organization_domains_list"] = [domain]
    else:
        payload["q_organization_name"] = org_name

    try:
        resp = requests.post(SEARCH_URL, headers=HEADERS, json=payload, timeout=15)
        if resp.status_code != 200:
            print(f"    [search] {resp.status_code} for {org_name}: {resp.text[:200]}")
            return None
        return resp.json().get("people") or []
    except requests.RequestException as e:
        print(f"    [search] error for {org_name}: {e}")
        return None


# ── Phase 2: Reveal ──────────────────────────────────────────────────────────

def reveal_person(apollo_id: str) -> dict | None:
    """Reveal full contact details for an Apollo person ID. Costs 1 credit."""
    payload = {
        "id": apollo_id,
        "reveal_personal_emails": True,
    }
    try:
        resp = requests.post(MATCH_URL, headers=HEADERS, json=payload, timeout=15)
        if resp.status_code != 200:
            print(f"    [reveal] {resp.status_code} for {apollo_id}: {resp.text[:200]}")
            return None
        return resp.json().get("person")
    except requests.RequestException as e:
        print(f"    [reveal] error for {apollo_id}: {e}")
        return None


def parse_revealed(person: dict) -> dict:
    """Extract contact fields from a fully revealed Apollo person."""
    result = {
        "apollo_id": person.get("id") or "",
        "person_name": person.get("name") or "",
        "first_name": person.get("first_name") or "",
        "last_name": person.get("last_name") or "",
        "title": person.get("title") or "",
        "seniority": person.get("seniority") or "",
    }

    # Department
    depts = person.get("departments") or []
    result["department"] = ", ".join(depts) if depts else ""

    # Email — prefer work, fall back to any
    email = person.get("email") or ""
    if not email:
        for e in (person.get("email_addresses") or []):
            if e.get("email"):
                email = e["email"]
                break
    result["email"] = email

    # LinkedIn
    result["linkedin"] = person.get("linkedin_url") or ""

    # Twitter
    tw = person.get("twitter_url") or ""
    if not tw and person.get("twitter_username"):
        tw = f"https://x.com/{person['twitter_username']}"
    result["twitter"] = tw

    # Phone
    phones = person.get("phone_numbers") or []
    result["phone"] = phones[0].get("sanitized_number", "") if phones else ""

    # Org
    org = person.get("organization") or {}
    result["org_name"] = org.get("name") or ""

    return result


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    if not APOLLO_KEY:
        raise SystemExit("APOLLO_API_KEY not set in .env.local")

    sponsors = list(csv.DictReader(open(INPUT_CSV, newline="", encoding="utf-8")))
    print(f"[csv] Loaded {len(sponsors)} sponsors from {INPUT_CSV}")

    search_cache = load_json(SEARCH_CACHE)
    reveal_cache = load_json(REVEAL_CACHE)

    # ── Phase 1: Search for people at each company ───────────────────────────
    print("\n── Phase 1: Search ──")
    search_hits = 0
    search_misses = 0

    for i, sponsor in enumerate(sponsors, 1):
        name = sponsor["name"].strip()
        website = sponsor.get("website", "").strip()

        if name in SKIP_NAMES:
            print(f"  [{i}/{len(sponsors)}] SKIP (venue): {name}")
            continue

        domain = domain_from_url(website)
        cache_key = domain or name

        if cache_key in search_cache:
            cached = search_cache[cache_key]
            if cached is None:
                search_misses += 1
            else:
                search_hits += 1
            print(f"  [{i}/{len(sponsors)}] CACHED: {name} ({len(cached) if cached else 0} people)")
            continue

        print(f"  [{i}/{len(sponsors)}] Searching: {name} (domain={domain})")
        people = search_people(domain, name)

        if people:
            # Store raw stubs (id, first_name, title, org)
            search_cache[cache_key] = [
                {
                    "id": p.get("id"),
                    "first_name": p.get("first_name"),
                    "title": p.get("title"),
                    "org": (p.get("organization") or {}).get("name"),
                }
                for p in people
            ]
            print(f"    → {len(people)} people")
            search_hits += 1
        else:
            search_cache[cache_key] = None
            print(f"    → No results")
            search_misses += 1

        save_json(SEARCH_CACHE, search_cache)
        time.sleep(RATE_DELAY)

    print(f"\n  Search complete: {search_hits} hits, {search_misses} misses")

    # ── Phase 2: Reveal contacts ─────────────────────────────────────────────
    print("\n── Phase 2: Reveal ──")

    # Collect all Apollo IDs that need revealing
    id_to_sponsor = {}  # apollo_id -> (company_name, tier)
    for sponsor in sponsors:
        name = sponsor["name"].strip()
        tier = sponsor["tier"].strip()
        website = sponsor.get("website", "").strip()
        if name in SKIP_NAMES:
            continue
        domain = domain_from_url(website)
        cache_key = domain or name
        stubs = search_cache.get(cache_key)
        if not stubs:
            continue
        for stub in stubs:
            aid = stub.get("id")
            if aid:
                id_to_sponsor[aid] = (name, tier)

    total_ids = len(id_to_sponsor)
    already_revealed = sum(1 for aid in id_to_sponsor if aid in reveal_cache)
    to_reveal = [aid for aid in id_to_sponsor if aid not in reveal_cache]

    print(f"  Total people: {total_ids}")
    print(f"  Already revealed: {already_revealed}")
    print(f"  To reveal: {len(to_reveal)} (1 credit each)")

    if to_reveal:
        print(f"  Revealing {len(to_reveal)} contacts...")

    reveals_done = 0
    reveals_failed = 0

    for j, aid in enumerate(to_reveal, 1):
        company, _ = id_to_sponsor[aid]
        print(f"  [{j}/{len(to_reveal)}] Revealing: {aid} ({company})")

        person = reveal_person(aid)
        if person:
            reveal_cache[aid] = parse_revealed(person)
            reveals_done += 1
        else:
            reveal_cache[aid] = None
            reveals_failed += 1

        save_json(REVEAL_CACHE, reveal_cache)
        time.sleep(RATE_DELAY)

    print(f"\n  Reveals: {reveals_done} success, {reveals_failed} failed")

    # ── Phase 3: Assemble output CSV ─────────────────────────────────────────
    print("\n── Phase 3: Write CSV ──")

    all_contacts = []
    for aid, (company, tier) in id_to_sponsor.items():
        revealed = reveal_cache.get(aid)
        if not revealed:
            continue
        all_contacts.append({
            "company": company,
            "tier": tier,
            **revealed,
        })

    fieldnames = [
        "company", "tier", "person_name", "first_name", "last_name",
        "title", "seniority", "department",
        "email", "linkedin", "twitter", "phone", "org_name", "apollo_id",
    ]

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_contacts)

    # Summary
    has_email = sum(1 for c in all_contacts if c.get("email", "").strip())
    has_linkedin = sum(1 for c in all_contacts if c.get("linkedin", "").strip())
    has_phone = sum(1 for c in all_contacts if c.get("phone", "").strip())

    print(f"\n✓ Done")
    print(f"  Total contacts: {len(all_contacts)}")
    print(f"  With email:    {has_email}/{len(all_contacts)}")
    print(f"  With LinkedIn: {has_linkedin}/{len(all_contacts)}")
    print(f"  With phone:    {has_phone}/{len(all_contacts)}")
    print(f"  Written to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
