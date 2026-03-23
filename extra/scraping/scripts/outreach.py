"""
FP Block — EthCC Cannes Outreach Generator

Pipeline:
  1. Read enriched_speakers.csv
  2. Keep speakers with icp_score >= ICP_THRESHOLD and a Twitter/X handle
  3. Batch-scrape recent tweets via Apify (actor wbpC5fjeAxy06bonV)
  4. Generate a personalised outreach message per speaker with Claude
  5. Write outreach_messages.csv
"""

import csv
import json
import os
import re
import time
from pathlib import Path
from dotenv import load_dotenv
from apify_client import ApifyClient
import anthropic

# ── Config ────────────────────────────────────────────────────────────────────
load_dotenv("../../.env.local")

APIFY_TOKEN      = os.getenv("APIFY_API_TOKEN")
ANTHROPIC_KEY    = os.getenv("ANTHROPIC_API_KEY")   # optional — falls back to env
TWITTER_ACTOR    = "wbpC5fjeAxy06bonV"              # from user-supplied snippet
ICP_THRESHOLD    = 75                               # only target strong ICP fits
MAX_TWEETS       = 10                               # recent tweets per person
INPUT_CSV        = "../data/enriched_speakers.csv"
OUTPUT_CSV       = "../data/outreach_messages.csv"

FP_BLOCK_USP = """
FP Block is a full-stack blockchain engineering firm that builds and rescues
mission-critical on-chain systems. Their proprietary Kolme framework gives
clients the performance and isolation of a dedicated application-specific
blockchain while keeping seamless interoperability with Ethereum, Solana, and
Cosmos. The core question FP Block poses: why would a team with a high-stakes
digital economy risk it on infrastructure they don't control?
"""

ICP_LANGUAGE = """
Language guidance (strictly follow):
- Lead with: permanence, ownership, irreversibility, incentives, trust boundaries
- Avoid: web3 labels, ecosystem jargon, tool or protocol names
- The problem must sound real even if you never mention blockchain
- Do NOT use words like "blockchain", "DeFi", "Web3", "on-chain", "crypto"
  unless absolutely necessary to identify the context
"""

# ── Helpers ───────────────────────────────────────────────────────────────────

def extract_twitter_handle(social_url: str) -> str | None:
    """Return bare handle (no @) from a twitter.com or x.com URL, else None."""
    if not social_url:
        return None
    m = re.search(r"(?:twitter\.com|x\.com)/([A-Za-z0-9_]+)", social_url)
    if m:
        handle = m.group(1)
        # Skip generic/invalid handles
        if handle.lower() in {"home", "search", "explore", "notifications", "messages", "settings"}:
            return None
        return handle
    return None


def load_speakers(path: str, threshold: int) -> list[dict]:
    """Load speakers above the ICP threshold that have a Twitter URL."""
    speakers = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            score_raw = row.get("icp_score", "").strip()
            if not score_raw:
                continue
            try:
                score = int(score_raw)
            except ValueError:
                continue
            if score < threshold:
                continue
            handle = extract_twitter_handle(row.get("social", ""))
            if not handle:
                continue
            speakers.append({
                "name":       row["name"].strip(),
                "org":        row["org"].strip(),
                "track":      row["track"].strip(),
                "social":     row["social"].strip(),
                "handle":     handle,
                "usp":        row.get("usp", "").strip(),
                "icp_score":  score,
                "icp_reason": row.get("icp_reason", "").strip(),
            })
    return speakers


def _match_handle(user_id: str, description: str, tweets: list[str],
                  handle_to_org: dict[str, str]) -> str | None:
    """
    This actor strips screen_name from its output.
    Match a user_id → handle using bio description + tweet content vs known org names.
    """
    desc_lower = description.lower()
    best_handle, best_score = None, 0.0

    for handle, org in handle_to_org.items():
        score = 0.0
        # Direct handle mention in bio (strongest signal)
        if handle.lower() in desc_lower:
            score += 3.0
        # Org name words in bio
        org_words = [w for w in re.findall(r"[a-z0-9]{3,}", org.lower())
                     if w not in {"the", "and", "for", "with", "labs", "inc"}]
        for w in org_words:
            if w in desc_lower:
                score += 1.0
        # Org name words in tweets
        tweet_blob = " ".join(tweets).lower()
        for w in org_words:
            if w in tweet_blob:
                score += 0.3
        if score > best_score:
            best_score, best_handle = score, handle

    return best_handle if best_score > 0 else None


def scrape_tweets(speakers: list[dict]) -> dict[str, list[str]]:
    """
    Run the Apify Twitter scraper for all handles in one batch.
    This actor strips screen_name, so we match via bio description + tweet content.
    Returns {handle_lower: [tweet_text, ...]}
    """
    client = ApifyClient(APIFY_TOKEN)
    handles = [s["handle"] for s in speakers]
    handle_to_org = {s["handle"].lower(): s["org"] for s in speakers}
    start_urls = [f"https://x.com/{h}" for h in handles]

    print(f"[apify] Scraping {len(handles)} Twitter profiles …")
    run = client.actor(TWITTER_ACTOR).call(run_input={
        "startUrls":              start_urls,
        "maxTweetsPerUser":       MAX_TWEETS,
        "onlyUserInfo":           False,
        "addUserInfo":            True,
        "addNotFoundUsersToOutput": False,
        "addSuspendedUsersToOutput": False,
        "proxy": {"useApifyProxy": True},
    })

    # Group items by user_id_str — actor strips screen_name
    from collections import defaultdict
    groups: dict[str, dict] = defaultdict(lambda: {"tweets": [], "description": ""})
    all_items = client.dataset(run["defaultDatasetId"]).list_items(limit=1000).items
    for item in all_items:
        uid = item.get("user_id_str", "")
        if not uid:
            continue
        groups[uid]["tweets"].append(item.get("full_text") or item.get("text") or "")
        if not groups[uid]["description"]:
            groups[uid]["description"] = (item.get("user") or {}).get("description", "")

    # Match each user_id group → handle via description
    results: dict[str, list[str]] = {}
    for uid, data in groups.items():
        matched = _match_handle(uid, data["description"], data["tweets"], handle_to_org)
        if matched:
            results[matched] = [t for t in data["tweets"] if t]
        else:
            print(f"  [warn] Could not match user_id {uid} (bio: {data['description'][:60]})")

    print(f"[apify] Got tweet data for {len(results)} handles.")
    return results


def build_outreach_template(speaker: dict, tweets: list[str]) -> str:
    """Deterministic template fallback when no Anthropic key is available."""
    hook_tweet = tweets[0].replace("\n", " ")[:160] if tweets else ""
    hook = f'Your recent point — "{hook_tweet[:120]}…" — ' if hook_tweet else f"The work {speaker['org']} is doing on {speaker['track'].lower()} "
    return (
        f"{hook}cuts to something we keep seeing at scale: the cost of a decision "
        f"that looked fine at the time, but became permanent before anyone noticed. "
        f"At FP Block we built Kolme specifically for teams that cannot afford to "
        f"discover that kind of regret after the fact. "
        f"Would you have 20 minutes at EthCC in Cannes to talk through where that pressure shows up in your stack?"
    )


def build_outreach(speaker: dict, tweets: list[str], claude: anthropic.Anthropic) -> str:
    """Ask Claude to write a short, personalised outreach DM."""
    tweet_block = "\n".join(f"- {t}" for t in tweets[:MAX_TWEETS]) if tweets else "(no recent tweets available)"

    prompt = f"""You are writing a short, genuine Twitter/X direct message on behalf of FP Block,
a full-stack blockchain engineering firm attending EthCC in Cannes (June 2026).
The goal is to secure a brief in-person meeting at the conference.

About FP Block:
{FP_BLOCK_USP.strip()}

{ICP_LANGUAGE.strip()}

Recipient profile:
- Name: {speaker['name']}
- Organisation: {speaker['org']}
- Conference track: {speaker['track']}
- Why they fit FP Block's ICP: {speaker['icp_reason']}
- Their organisation in one line: {speaker['usp']}
- ICP score (0–100): {speaker['icp_score']}

Their recent tweets (use these to find a genuine, specific hook):
{tweet_block}

Write ONE direct message. Rules:
1. ≤ 5 sentences, conversational, zero fluff.
2. Open with ONE concrete hook drawn from their tweets or their known work — be specific, not generic.
3. Connect the hook to the cost of permanence / irreversibility without naming blockchain tools.
4. Name FP Block and Kolme naturally in one sentence.
5. End with a soft, specific ask for 20 minutes at EthCC in Cannes.
6. No emojis. No hashtags. No "I hope this finds you well."
7. Output ONLY the message text — no subject line, no explanation."""

    msg = claude.messages.create(
        model="claude-opus-4-6",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not APIFY_TOKEN:
        raise SystemExit("APIFY_API_TOKEN not found in .env.local")

    # Load speakers
    speakers = load_speakers(INPUT_CSV, ICP_THRESHOLD)
    print(f"[csv] {len(speakers)} speakers above ICP {ICP_THRESHOLD} with Twitter handles.")

    if not speakers:
        raise SystemExit("No qualifying speakers found — check threshold or CSV.")

    # Batch-scrape Twitter
    tweets_by_handle = scrape_tweets(speakers)

    # Init Claude (optional — template fallback if no key)
    claude = None
    if ANTHROPIC_KEY:
        claude = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
        print("[claude] Using Claude for message generation.")
    else:
        print("[claude] ANTHROPIC_API_KEY not set — using template fallback. Add it to .env.local for AI-generated messages.")

    # Generate outreach
    rows = []
    for i, speaker in enumerate(speakers, 1):
        tweets = tweets_by_handle.get(speaker["handle"].lower(), [])
        print(f"[{i}/{len(speakers)}] Generating message for {speaker['name']} (@{speaker['handle']}) — {len(tweets)} tweets")
        if claude:
            message = build_outreach(speaker, tweets, claude)
        else:
            message = build_outreach_template(speaker, tweets)
        rows.append({
            "name":       speaker["name"],
            "org":        speaker["org"],
            "handle":     f"@{speaker['handle']}",
            "social":     speaker["social"],
            "icp_score":  speaker["icp_score"],
            "icp_reason": speaker["icp_reason"],
            "tweet_count": len(tweets),
            "outreach_message": message,
        })
        time.sleep(0.5)   # small pause between Claude calls

    # Write output
    fieldnames = ["name", "org", "handle", "social", "icp_score", "icp_reason", "tweet_count", "outreach_message"]
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n✓ Done — {len(rows)} outreach messages written to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
