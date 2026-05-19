"""Send Telegram DMs from a CSV via your personal account (MTProto / Telethon).

CSV format (header required): identifier,message
  - identifier: @username, +E.164 phone, or numeric user_id
  - message: text to send. May reference any other CSV column via {placeholder}.
  - extra columns are passed to .format() so you can do {name}, {org}, etc.

Usage:
  python send_messages.py data/contacts.csv               # send for real
  python send_messages.py data/contacts.csv --dry-run     # print, don't send
  python send_messages.py data/contacts.csv --limit 10    # cap this run
  python send_messages.py data/contacts.csv --max-per-day 25
                                                          # cap rolling 24h window
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import os
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from telethon import TelegramClient
from telethon.errors import (
    FloodWaitError,
    PeerFloodError,
    UserPrivacyRestrictedError,
)

ROOT = Path(__file__).resolve().parent
SESSIONS_DIR = ROOT / "sessions"
LOGS_DIR = ROOT / "logs"
SENT_LOG = LOGS_DIR / "sent.log"


def load_config() -> dict:
    # .env.local takes precedence (Next.js convention), then .env
    load_dotenv(ROOT / ".env.local")
    load_dotenv(ROOT / ".env")
    api_id = os.getenv("TG_API_ID")
    api_hash = os.getenv("TG_API_HASH")
    phone = os.getenv("TG_PHONE")
    if not api_id or not api_hash or not phone:
        sys.exit("Missing TG_API_ID, TG_API_HASH, or TG_PHONE in .env")
    return {
        "api_id": int(api_id),
        "api_hash": api_hash,
        "phone": phone,
        "session_name": os.getenv("TG_SESSION_NAME", "personal"),
        "delay": float(os.getenv("SEND_DELAY_SECONDS", "4")),
        "jitter": float(os.getenv("SEND_JITTER_SECONDS", "3")),
        "max_per_run": int(os.getenv("MAX_SENDS_PER_RUN", "0")),
    }


def load_already_sent() -> set[str]:
    if not SENT_LOG.exists():
        return set()
    sent: set[str] = set()
    with SENT_LOG.open() as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) >= 3 and parts[1] == "OK":
                sent.add(parts[2])
    return sent


def count_recent_sends(window_hours: float = 24.0) -> int:
    """Count OK rows in sent.log whose timestamp is within the rolling window."""
    if not SENT_LOG.exists():
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(hours=window_hours)
    n = 0
    with SENT_LOG.open() as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) < 2 or parts[1] != "OK":
                continue
            try:
                ts = datetime.fromisoformat(parts[0])
            except ValueError:
                continue
            if ts >= cutoff:
                n += 1
    return n


def append_log(status: str, identifier: str, detail: str = "") -> None:
    LOGS_DIR.mkdir(exist_ok=True)
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with SENT_LOG.open("a") as f:
        f.write(f"{ts}\t{status}\t{identifier}\t{detail}\n")


def parse_identifier(raw: str) -> str | int:
    raw = raw.strip()
    if raw.startswith("@") or raw.startswith("+"):
        return raw
    if raw.isdigit():
        return int(raw)
    return raw  # bare username, phone without +, etc. — Telethon will try


def render_message(template: str, row: dict) -> str:
    safe_row = {k: (v if v is not None else "") for k, v in row.items()}
    try:
        return template.format(**safe_row)
    except KeyError as e:
        raise ValueError(f"missing placeholder {e} in row {row!r}") from e


async def run(csv_path: Path, *, dry_run: bool, limit: int | None, max_per_day: int | None) -> None:
    cfg = load_config()
    SESSIONS_DIR.mkdir(exist_ok=True)
    LOGS_DIR.mkdir(exist_ok=True)

    already = load_already_sent()
    sent_last_24h = count_recent_sends(24.0)

    with csv_path.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        sys.exit(f"no rows in {csv_path}")
    if "identifier" not in rows[0] or "message" not in rows[0]:
        sys.exit("CSV must have at least 'identifier' and 'message' columns")

    total = len(rows)
    cap = cfg["max_per_run"] if cfg["max_per_run"] > 0 else None
    if limit is not None:
        cap = min(cap, limit) if cap else limit

    daily_remaining: int | None = None
    if max_per_day is not None:
        daily_remaining = max(0, max_per_day - sent_last_24h)

    print(f"loaded {total} rows from {csv_path}")
    print(f"already sent (per logs/sent.log): {len(already)}")
    print(f"sends in last 24h: {sent_last_24h}")
    if max_per_day is not None:
        print(f"rolling 24h cap: {max_per_day}; remaining headroom: {daily_remaining}")
        if daily_remaining == 0:
            print("daily cap already met — exiting without sending")
            return
    if dry_run:
        print("DRY RUN — no messages will be sent")

    session_path = str(SESSIONS_DIR / cfg["session_name"])
    client = TelegramClient(session_path, cfg["api_id"], cfg["api_hash"])
    await client.start(phone=cfg["phone"])

    sent_count = 0
    try:
        for i, row in enumerate(rows, 1):
            ident_raw = (row.get("identifier") or "").strip()
            if not ident_raw:
                print(f"[{i}/{total}] skip: empty identifier")
                continue
            if ident_raw in already:
                print(f"[{i}/{total}] skip: already sent to {ident_raw}")
                continue
            if cap is not None and sent_count >= cap:
                print(f"reached cap of {cap}, stopping")
                break
            if daily_remaining is not None and daily_remaining <= 0:
                print(f"hit rolling 24h cap of {max_per_day}, stopping")
                break

            try:
                message = render_message(row["message"], row)
            except ValueError as e:
                print(f"[{i}/{total}] skip {ident_raw}: {e}")
                append_log("ERR", ident_raw, str(e))
                continue

            target = parse_identifier(ident_raw)
            preview = message.replace("\n", " ")[:80]
            print(f"[{i}/{total}] -> {ident_raw}: {preview}")

            if dry_run:
                continue

            try:
                await client.send_message(target, message)
                append_log("OK", ident_raw)
                sent_count += 1
                if daily_remaining is not None:
                    daily_remaining -= 1
            except FloodWaitError as e:
                wait = int(e.seconds) + 5
                print(f"  FloodWait: sleeping {wait}s then retrying once")
                await asyncio.sleep(wait)
                try:
                    await client.send_message(target, message)
                    append_log("OK", ident_raw, "after-floodwait")
                    sent_count += 1
                    if daily_remaining is not None:
                        daily_remaining -= 1
                except Exception as e2:
                    print(f"  retry failed: {e2}")
                    append_log("ERR", ident_raw, f"retry: {e2}")
            except PeerFloodError:
                print("  PeerFlood: Telegram says you're sending too fast/spammy. Stopping.")
                append_log("ERR", ident_raw, "PeerFlood — stopped run")
                break
            except UserPrivacyRestrictedError:
                print("  user privacy settings block DMs from non-contacts")
                append_log("ERR", ident_raw, "UserPrivacyRestricted")
            except Exception as e:
                print(f"  failed: {e}")
                append_log("ERR", ident_raw, str(e))

            delay = cfg["delay"] + random.uniform(0, cfg["jitter"])
            await asyncio.sleep(delay)
    finally:
        await client.disconnect()

    print(f"done. sent {sent_count} message(s).")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv", type=Path, help="path to contacts CSV")
    ap.add_argument("--dry-run", action="store_true", help="print actions, don't send")
    ap.add_argument("--limit", type=int, default=None, help="cap sends this run")
    ap.add_argument(
        "--max-per-day",
        type=int,
        default=None,
        help="cap rolling 24h window (counts OK rows in sent.log within last 24h)",
    )
    args = ap.parse_args()

    if not args.csv.exists():
        sys.exit(f"file not found: {args.csv}")

    asyncio.run(run(
        args.csv,
        dry_run=args.dry_run,
        limit=args.limit,
        max_per_day=args.max_per_day,
    ))


if __name__ == "__main__":
    main()
