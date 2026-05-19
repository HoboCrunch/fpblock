"""Render per-quadrant Telegram bodies for tg-napalm rows into a send-ready CSV.

Reads:
  - ../tg-napalm.csv (contacts with quadrant + telegram handle)
  - ../tg-template.md (Q1–Q4 message bodies inside fenced ``` blocks)

Writes a CSV with columns: identifier,name,company,quadrant,inferred,message
which `send_messages.py` can consume directly (it uses 'identifier' + 'message';
the rest is for your own audit / filtering).

Usage:
  python build_send_csv.py                            # all quadrants → data/send.csv
  python build_send_csv.py --quadrants 1,2            # Q1+Q2 only
  python build_send_csv.py --skip-inferred            # drop telegram_inferred=true
  python build_send_csv.py --output data/q1.csv      # custom output path
  python build_send_csv.py --dry-run                  # preview only, no write
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_CONTACTS = ROOT.parent / "tg-napalm.csv"
DEFAULT_TEMPLATE = ROOT.parent / "tg-template.md"
DEFAULT_OUTPUT = ROOT / "data" / "send.csv"


def parse_templates(md: str) -> dict[str, str]:
    """Extract one fenced code block per ## Q<N> heading."""
    bodies: dict[str, str] = {}
    pattern = re.compile(
        r"^##\s*Q(\d+)\b[^\n]*\n.*?\n```\s*\n(.*?)\n```",
        re.MULTILINE | re.DOTALL,
    )
    for m in pattern.finditer(md):
        bodies[m.group(1)] = m.group(2).strip()
    if not bodies:
        sys.exit("no Q<N> templates found in template file")
    return bodies


def first_name(full_name: str) -> str:
    parts = (full_name or "").strip().split()
    return parts[0] if parts else "there"


def render(template: str, first: str, company: str) -> str:
    safe_company = company.strip() if company and company.strip() else "your team"
    return template.format(first_name=first, company=safe_company)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--contacts", type=Path, default=DEFAULT_CONTACTS)
    ap.add_argument("--template", type=Path, default=DEFAULT_TEMPLATE)
    ap.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    ap.add_argument("--quadrants", default="1,2,3,4", help="comma list of quadrants to include")
    ap.add_argument("--skip-inferred", action="store_true", help="drop rows where telegram_inferred=true")
    ap.add_argument("--no-dedupe", action="store_true", help="keep duplicate handles (default: dedupe, keep lowest quadrant)")
    ap.add_argument("--dry-run", action="store_true", help="don't write output, just print the summary")
    args = ap.parse_args()

    if not args.contacts.exists():
        sys.exit(f"contacts file not found: {args.contacts}")
    if not args.template.exists():
        sys.exit(f"template file not found: {args.template}")

    quadrants = {q.strip() for q in args.quadrants.split(",") if q.strip()}
    bodies = parse_templates(args.template.read_text())
    missing = quadrants - bodies.keys()
    if missing:
        sys.exit(f"template missing quadrants: {sorted(missing)}")

    with args.contacts.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    out_rows: list[dict] = []
    skipped = {"quadrant": 0, "no_handle": 0, "inferred": 0}
    for r in rows:
        q = (r.get("quadrant") or "").strip()
        if q not in quadrants:
            skipped["quadrant"] += 1
            continue
        handle = (r.get("telegram") or "").strip()
        if not handle:
            skipped["no_handle"] += 1
            continue
        inferred = (r.get("telegram_inferred") or "").strip().lower() == "true"
        if args.skip_inferred and inferred:
            skipped["inferred"] += 1
            continue

        first = first_name(r.get("full_name", ""))
        message = render(bodies[q], first, r.get("company", ""))
        out_rows.append({
            "identifier": handle,
            "name": r.get("full_name", ""),
            "company": r.get("company", ""),
            "quadrant": q,
            "inferred": "true" if inferred else "false",
            "message": message,
        })

    if not args.no_dedupe:
        seen: dict[str, dict] = {}
        for r in out_rows:
            key = r["identifier"].lower()
            existing = seen.get(key)
            if existing is None or int(r["quadrant"]) < int(existing["quadrant"]):
                seen[key] = r
        deduped = list(seen.values())
        dropped = len(out_rows) - len(deduped)
        out_rows = deduped
    else:
        dropped = 0

    from collections import Counter
    by_q = Counter(r["quadrant"] for r in out_rows)
    inferred_n = sum(1 for r in out_rows if r["inferred"] == "true")

    print(f"contacts read:        {len(rows)}")
    print(f"skipped (quadrant):   {skipped['quadrant']}")
    print(f"skipped (no handle):  {skipped['no_handle']}")
    print(f"skipped (inferred):   {skipped['inferred']}")
    print(f"deduped:              {dropped}")
    print(f"output rows:          {len(out_rows)}")
    print(f"  by quadrant:        {dict(sorted(by_q.items()))}")
    print(f"  inferred-from-X:    {inferred_n}")
    if out_rows:
        print(f"  preview ({out_rows[0]['identifier']}):")
        print("  ---")
        for line in out_rows[0]["message"].splitlines():
            print(f"  {line}")
        print("  ---")

    if args.dry_run:
        print("\ndry-run, not writing")
        return

    args.output.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["identifier", "name", "company", "quadrant", "inferred", "message"]
    with args.output.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(out_rows)
    print(f"\nwrote {len(out_rows)} rows to {args.output}")


if __name__ == "__main__":
    main()
