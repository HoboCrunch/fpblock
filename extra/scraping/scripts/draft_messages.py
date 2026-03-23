"""
Outreach Message Drafter — EthCC Cannes Speakers

Uses Perplexity API to research each company's recent news,
then drafts a short, personalized outreach message.

Reads:  enriched_speakers.csv
Writes: enriched_speakers.csv (updates Message column)
"""

import csv
import json
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env.local")

PERPLEXITY_KEY = os.getenv("PERPLEXITY_API_KEY")
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
CSV_FILE = DATA_DIR / "enriched_speakers.csv"
BACKUP = DATA_DIR / "enriched_speakers_msg_backup.csv"
CACHE_FILE = DATA_DIR / "company_news_cache.json"

PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions"


def load_cache():
    if CACHE_FILE.exists():
        with open(CACHE_FILE) as f:
            return json.load(f)
    return {}


def save_cache(cache):
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)


def research_company(company: str, notes: str, cache: dict) -> str:
    """Get a one-liner about recent company news via Perplexity."""
    cache_key = company.upper().strip()
    if cache_key in cache:
        return cache[cache_key]

    prompt = f"""What is the most notable recent news, announcement, product launch, partnership, or milestone for the company "{company}" in the crypto/fintech space from 2025-2026?

Context about the company: {notes[:200]}

Reply with ONLY a single short sentence (max 15 words) describing the specific recent development. No preamble, no explanation. If nothing recent, describe their core product in one specific sentence."""

    headers = {
        "Authorization": f"Bearer {PERPLEXITY_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "sonar",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 80,
        "temperature": 0.1,
    }

    try:
        resp = requests.post(PERPLEXITY_URL, headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        result = data["choices"][0]["message"]["content"].strip()
        # Clean up common prefixes
        for prefix in ["The most notable", "Recently,", "In 2025,", "In 2026,"]:
            if result.startswith(prefix):
                result = result[len(prefix):].strip().lstrip(",").strip()
        cache[cache_key] = result
        save_cache(cache)
        return result
    except Exception as e:
        print(f"    [perplexity] Error for {company}: {e}")
        cache[cache_key] = ""
        save_cache(cache)
        return ""


def draft_message(first_name: str, company: str, news_snippet: str) -> str:
    """Draft the outreach message."""
    if not first_name or first_name.upper() in ("NOID", "AMXX", "SHEALTIELANZ", "DEFINIKOLA", "ALICEANDBOB", "ZK_EVM", "HILDOBBY", "BINJI", "0XPENRYN", "0XRAJEEV", "ALBICODES", "DMH", "JACOBC.ETH", "ARIUTOKINTUMI", "PBJ", "1SLA.ETH", "JISTRO"):
        # Handle pseudonyms/handles - just use as-is
        first_name = first_name.title() if first_name else "there"

    # Build the personalization line
    if news_snippet:
        personal = f"Been following {company.title()}'s work — {news_snippet.rstrip('.')}."
    else:
        personal = f"Been following what {company.title()} is building — really interesting work."

    msg = (
        f"Hey {first_name}, I saw you're speaking at EthCC Cannes this year — exciting stuff. "
        f"{personal} "
        f"Would love to grab coffee and connect while we're both there. "
        f"If you're up for it, you can schedule at gofpblock.com. "
        f"Cheers, JB"
    )
    return msg


def main():
    if not PERPLEXITY_KEY:
        raise SystemExit("PERPLEXITY_API_KEY not set in .env.local")

    csv.field_size_limit(sys.maxsize)

    # Read CSV
    with open(CSV_FILE, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    print(f"[csv] Loaded {len(rows)} speakers")

    # Backup
    with open(BACKUP, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
    print(f"[csv] Backup at {BACKUP}")

    cache = load_cache()

    # Get unique companies to minimize API calls
    companies = {}
    for r in rows:
        company = r.get("Company", "").strip()
        if company and company.upper() not in companies:
            companies[company.upper()] = {
                "display": company,
                "notes": r.get("Notes", "")[:200],
            }

    already_cached = sum(1 for norm in companies if norm in cache)
    to_research = len(companies) - already_cached
    print(f"[research] {len(companies)} unique companies ({already_cached} cached, {to_research} to research)")
    print(f"[research] Estimated time: ~{to_research * 1.5:.0f}s for API calls\n")

    # Research each company
    for i, (norm, info) in enumerate(companies.items(), 1):
        if norm in cache:
            status = "CACHED"
            snippet = cache[norm]
        else:
            snippet = research_company(info["display"], info["notes"], cache)
            status = "NEW"
            time.sleep(0.5)  # Rate limit

        # Truncate snippet for display
        display_snippet = snippet[:55] + "..." if len(snippet) > 55 else snippet
        print(f"  [{i:3d}/{len(companies)}] {status:6s} | {info['display']:40s} | {display_snippet}")

    print(f"\n[research] Done — {len(cache)} companies in cache")

    # Draft messages for all rows
    print(f"\n[draft] Writing messages for {len(rows)} speakers...")
    drafted = 0
    for i, r in enumerate(rows, 1):
        company = r.get("Company", "").strip()
        name = r.get("Name", "").strip()
        first_name = name.split()[0].title() if name else ""

        news = cache.get(company.upper(), "")
        r["Message"] = draft_message(first_name, company, news)
        drafted += 1

        # Print every row
        msg_preview = r["Message"][:70] + "..."
        print(f"  [{i:3d}/{len(rows)}] {name:30s} -> {msg_preview}")

        # Save CSV every 10 rows (and on last row)
        if i % 10 == 0 or i == len(rows):
            with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(rows)
            print(f"         --- saved ({i}/{len(rows)}) ---")

    print(f"\n✓ Done — {drafted} messages drafted, written to {CSV_FILE}")


if __name__ == "__main__":
    main()
