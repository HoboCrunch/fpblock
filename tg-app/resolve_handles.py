"""Probe each telegram handle in a contacts CSV without sending anything.

Calls client.get_entity(handle) for every row. Records whether the handle
resolves to a real Telegram user, and writes an enriched CSV adding
`tg_resolved` (true/false) and `tg_resolve_error` (error message or empty).

Resume-safe: results are appended to logs/resolved.log progressively, and
re-running skips any handle already in the log. Cheaper than sends (no
message budget burned) but still throttled — Telegram does rate-limit
ResolveUsernameRequest.

Usage:
  python resolve_handles.py                              # ../tg-napalm.csv → ../tg-napalm-resolved.csv
  python resolve_handles.py --quadrants 1,2              # resolve subset
  python resolve_handles.py --limit 50                   # cap this run
  python resolve_handles.py --input PATH --output PATH   # custom paths
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import os
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from telethon import TelegramClient
from telethon.errors import FloodWaitError

ROOT = Path(__file__).resolve().parent
SESSIONS_DIR = ROOT / "sessions"
LOGS_DIR = ROOT / "logs"
RESOLVE_LOG = LOGS_DIR / "resolved.log"

DEFAULT_INPUT = ROOT.parent / "tg-napalm.csv"
DEFAULT_OUTPUT = ROOT.parent / "tg-napalm-resolved.csv"


def cfg() -> dict:
    load_dotenv(ROOT / ".env.local")
    load_dotenv(ROOT / ".env")
    for k in ("TG_API_ID", "TG_API_HASH", "TG_PHONE"):
        if not os.getenv(k):
            sys.exit(f"missing {k} in env")
    return {
        "api_id": int(os.environ["TG_API_ID"]),
        "api_hash": os.environ["TG_API_HASH"],
        "phone": os.environ["TG_PHONE"],
        "session": os.environ.get("TG_SESSION_NAME", "personal"),
    }


def load_prior_results() -> dict[str, tuple[bool, str]]:
    """Return {handle_lower: (resolved, error)} from the resolve log."""
    out: dict[str, tuple[bool, str]] = {}
    if not RESOLVE_LOG.exists():
        return out
    with RESOLVE_LOG.open() as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 3:
                continue
            _ts, status, handle = parts[0], parts[1], parts[2]
            err = parts[3] if len(parts) > 3 else ""
            out[handle.lower()] = (status == "OK", err)
    return out


def append_log(status: str, handle: str, detail: str = "") -> None:
    LOGS_DIR.mkdir(exist_ok=True)
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with RESOLVE_LOG.open("a") as f:
        f.write(f"{ts}\t{status}\t{handle}\t{detail}\n")


async def resolve_one(client: TelegramClient, handle: str) -> tuple[bool, str]:
    target = handle.lstrip("@")
    try:
        await client.get_entity(target)
        return True, ""
    except FloodWaitError:
        raise  # bubble up so caller can sleep
    except Exception as e:
        return False, type(e).__name__ + ": " + str(e)[:160]


async def run(args) -> None:
    c = cfg()
    LOGS_DIR.mkdir(exist_ok=True)

    quadrants = {q.strip() for q in args.quadrants.split(",") if q.strip()} if args.quadrants else None

    with args.input.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        sys.exit(f"no rows in {args.input}")

    prior = load_prior_results()
    print(f"loaded {len(rows)} rows from {args.input}")
    print(f"prior resolutions cached: {len(prior)}")

    client = TelegramClient(str(SESSIONS_DIR / c["session"]), c["api_id"], c["api_hash"])
    await client.start(phone=c["phone"])

    enriched: list[dict] = []
    new_resolved = 0
    new_failed = 0
    probed = 0

    try:
        for i, r in enumerate(rows, 1):
            handle = (r.get("telegram") or "").strip()
            row_out = dict(r)

            if not handle:
                row_out["tg_resolved"] = ""
                row_out["tg_resolve_error"] = ""
                enriched.append(row_out)
                continue

            q = (r.get("quadrant") or "").strip()
            if quadrants and q not in quadrants:
                # not probing this quadrant — pass through with cached result if any
                cached = prior.get(handle.lower())
                if cached is not None:
                    row_out["tg_resolved"] = "true" if cached[0] else "false"
                    row_out["tg_resolve_error"] = cached[1]
                else:
                    row_out["tg_resolved"] = ""
                    row_out["tg_resolve_error"] = ""
                enriched.append(row_out)
                continue

            cached = prior.get(handle.lower())
            if cached is not None:
                resolved, err = cached
                print(f"[{i}/{len(rows)}] cache: {handle} → {'OK' if resolved else 'ERR'}")
            else:
                if args.limit is not None and probed >= args.limit:
                    print(f"reached --limit {args.limit}, passing through remaining")
                    row_out["tg_resolved"] = ""
                    row_out["tg_resolve_error"] = ""
                    enriched.append(row_out)
                    continue
                probed += 1
                try:
                    resolved, err = await resolve_one(client, handle)
                except FloodWaitError as e:
                    wait = int(e.seconds) + 5
                    print(f"  FloodWait: sleeping {wait}s")
                    await asyncio.sleep(wait)
                    try:
                        resolved, err = await resolve_one(client, handle)
                    except Exception as e2:
                        resolved, err = False, f"after-floodwait: {e2}"
                status = "OK" if resolved else "ERR"
                preview = err[:80] if err else ""
                print(f"[{i}/{len(rows)}] {status} {handle}  {preview}")
                append_log(status, handle, err)
                if resolved:
                    new_resolved += 1
                else:
                    new_failed += 1
                # throttle only on uncached probes
                await asyncio.sleep(args.delay + random.uniform(0, args.jitter))

            row_out["tg_resolved"] = "true" if resolved else "false"
            row_out["tg_resolve_error"] = err
            enriched.append(row_out)
    finally:
        await client.disconnect()

    fieldnames = list(rows[0].keys())
    for k in ("tg_resolved", "tg_resolve_error"):
        if k not in fieldnames:
            fieldnames.append(k)
    with args.output.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(enriched)

    total_resolved = sum(1 for r in enriched if r.get("tg_resolved") == "true")
    total_failed = sum(1 for r in enriched if r.get("tg_resolved") == "false")
    print()
    print(f"this run — probed: {probed}, new resolved: {new_resolved}, new failed: {new_failed}")
    print(f"total in output — resolved: {total_resolved}, failed: {total_failed}")
    print(f"wrote {args.output}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    ap.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    ap.add_argument("--quadrants", default=None, help="comma list, e.g. '1,2'; default = all")
    ap.add_argument("--limit", type=int, default=None, help="cap probes this run (cached hits don't count)")
    ap.add_argument("--delay", type=float, default=1.5, help="seconds between probes")
    ap.add_argument("--jitter", type=float, default=1.5, help="random jitter on top of delay")
    args = ap.parse_args()
    if not args.input.exists():
        sys.exit(f"input not found: {args.input}")
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
