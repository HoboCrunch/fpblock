#!/usr/bin/env python3
"""
build_sequences.py — Render the ready-to-send 4-touch sequence for every UNIQUE contact.

Reads the tiered send lists in ../sends/, dedupes to a unique-contact universe
(by email, priority P1 > P2 > P3 > P4 > REVIEW), and renders each contact's full
sequence with all merge fields filled. Copy is transcribed verbatim from
04-sequences-and-copy.md; P1 contacts get their personalized opener swapped into Touch #1.

Sender: Aaron Contorer <aaron@gofpblock.com>, same reply-to (per Evan, 2026-06-23).

Outputs (../sequences/):
  - sequences_long.csv   one row per (contact x touch) — import-ready for a sequencer
  - sequences_wide.csv   one row per contact, all touches rendered — review / mail-merge
  - prints a summary by readiness / tier / segment

Run from this dir:  python3 build_sequences.py
"""
import csv, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
SENDS = os.path.join(HERE, "..", "sends")
OUT = os.path.join(HERE, "..", "sequences")
os.makedirs(OUT, exist_ok=True)

FROM_NAME = "Aaron Contorer"
FROM_EMAIL = "aaron@gofpblock.com"
REPLY_TO = "aaron@gofpblock.com"

# Load order defines dedupe priority (first wins).
LOAD = [
    ("P1", "p1_priority_personalized.csv"),
    ("P2", "p2_strong.csv"),
    ("P3", "p3_broad.csv"),
    ("P4", "p4_low.csv"),
    ("REVIEW", "hold_review.csv"),
]

# ---- Touch #1 copy, per segment (verbatim from doc 04; fallbacks for the two
#      uncovered segments follow the same rules: <=~55 words, stakes not jargon,
#      one soft CTA, one question). {first} / {company} are the only merge fields. ----
SEG = {
    "Trading & DeFi": {
        "subject": "after the round",
        "greeting": "{first} — I'll skip the congrats.",
        "middle": "You raised to scale {company}. The part that bites usually isn't launch — it's the first liquidation or oracle path that moves money you can't claw back.",
        "closer": "We make that path provably correct before production does it for you. Worth a look?",
    },
    "Payments & Stablecoins": {
        "subject": "moving real money",
        "greeting": "{first} — skipping the congrats.",
        "middle": 'You raised to move more money through {company}. At scale, "close enough" stops being a rounding error and becomes a refund you can\'t issue — and a compliance conversation you didn\'t want.',
        "closer": "We build money-movement that reconciles exactly, every time. Worth a look?",
    },
    "RWA & Tokenization": {
        "subject": "auditor and a court",
        "greeting": "{first} — skipping the congrats.",
        "middle": "You're building {company} so a token stands for a real asset. That means the engineering has to hold up in front of an auditor and a court — not just on testnet.",
        "closer": "Closing that gap is exactly what we do. Worth a look?",
    },
    "Infra & Chains": {
        "subject": "when they build on you",
        "greeting": "{first} — skipping the congrats.",
        "middle": "You raised to grow {company}, which means more teams are about to build on top of you. Past a point, your edge cases become their outages — and your bugs are permanent in someone else's product.",
        "closer": "We harden infrastructure for exactly that moment. Worth a look?",
    },
    "AI x Crypto": {
        "subject": "before it sets",
        "greeting": "{first} — skipping the congrats.",
        "middle": "You're shipping {company} fast, probably with a lot of AI in the loop. That makes execution cheap — and the wrong architectural assumption permanent before anyone notices it.",
        "closer": "We catch those before they set. Worth a look?",
    },
    # --- fallbacks (no segment copy existed for these in doc 04) ---
    "Consumer/Gaming/Social": {
        "subject": "the part you can't patch",
        "greeting": "{first} — I'll skip the congrats.",
        "middle": "You raised to grow {company}. The pieces users actually trust — balances, ownership, payouts — are the ones where a quiet bug becomes real money or real items you can't claw back.",
        "closer": "We make those parts provably correct before they ship. Worth a look?",
    },
    "Other": {
        "subject": "after the round",
        "greeting": "{first} — I'll skip the congrats.",
        "middle": "You raised to scale {company}. The expensive failures usually aren't the visible ones — they're the parts that move value and can't be undone once they're live.",
        "closer": "We make those parts provably correct before production does. Worth a look?",
    },
}
DEFAULT_SEG = "Other"

T2_BODY = (
    "{first} — quick context on why I reached out directly.\n\n"
    "I ran Visual C++ at Microsoft and advised Bill Gates; my team has spent 500+ engineer-years on "
    "systems where being wrong is expensive. We rebuilt Levana's exchange in under 7 months — it's "
    "cleared over $1B since.\n\n"
    "Happy to send two examples close to {company}. Want them?"
)
T3_BODY = (
    "{first} — one thought, then I'll leave it.\n\n"
    "Most systems work right up until the moment they have to be trusted. The teams that sleep well "
    "aren't the fastest — they're the ones who made the irreversible parts correct early.\n\n"
    "If that's on your mind for {company}, I'm around."
)
T4_BODY = (
    "{first} — assuming the timing's off, so I'll stop here. If the \"can't-undo-it\" parts of "
    "{company} ever get loud, just reply and I'll jump in."
)
REPLY_ASK = (
    "Glad it's relevant. Easiest next step: a 15-min call where I walk through the two examples and "
    "you tell me where {company}'s irreversible parts actually are. Does Tue or Thu this week work?"
)

T3_SUBJECT = "one thought"
T4_SUBJECT = "closing the loop"

SIG_T1 = (
    "Aaron Contorer\n"
    "Founder & CEO, FP Block\n"
    "Ex-Microsoft (built Visual C++, advised Bill Gates) · Founder, FP Complete"
)
SIG_MIN = "Aaron\nFP Block"

FOOTER = (
    "FP Block · [STREET ADDRESS], [CITY, COUNTRY]\n"
    "You're getting this because you lead engineering at a company building systems where correctness "
    "matters, and that's what we do. Found you via your raise announcement.\n"
    'Not relevant? Reply "stop" and I\'ll remove you immediately. · [UNSUBSCRIBE LINK]'
)

SEND_DAYS = {1: 0, 2: 3, 3: 7, 4: 14}


def first_name(full):
    full = (full or "").strip()
    if not full:
        return ""
    return re.split(r"[\s,]+", full)[0]


def seg_of(row):
    s = (row.get("segment") or "").strip()
    return s if s in SEG else DEFAULT_SEG


def readiness(tier, row):
    """Per-contact send gate — rides along so guardrails aren't lost in a blast."""
    if not first_name(row.get("contact_name")):
        return "needs_name"          # don't send "Hi there" — route multichannel
    if tier == "REVIEW":
        return "verify_domain"        # common-name org collision — confirm domain first
    trust = (row.get("email_trust") or "").strip()
    if tier == "P4":
        return "optional"             # weak fit (gaming/social/consumer)
    if trust == "verified":
        return "ready"
    if trust in ("org_search_review", "verified_review_org"):
        return "verify_domain"
    # inferred_unverified / sheet_unverified / extrapolated
    return "verify_email"


def render(template, first, company):
    return template.format(first=first, company=company)


def assemble(body, sig):
    return f"{body}\n\n{sig}\n\n--\n{FOOTER}"


def touch1(tier, row, first, company):
    seg = seg_of(row)
    s = SEG[seg]
    greeting = render(s["greeting"], first, company)
    closer = render(s["closer"], first, company)
    if tier == "P1" and (row.get("personalized_opener") or "").strip():
        middle = (row["personalized_opener"]).strip()  # already specific to this company
    else:
        middle = render(s["middle"], first, company)
    body = f"{greeting}\n\n{middle}\n\n{closer}"
    return s["subject"], assemble(body, SIG_T1)


def build():
    seen = set()
    contacts = []
    for tier, fname in LOAD:
        path = os.path.join(SENDS, fname)
        with open(path) as fh:
            for row in csv.DictReader(fh):
                email = (row.get("email") or "").strip().lower()
                if not email or email in seen:
                    continue
                seen.add(email)
                contacts.append((tier, row))

    long_rows, wide_rows = [], []
    for tier, row in contacts:
        first = first_name(row.get("contact_name"))
        company = (row.get("company") or "").strip()
        seg = seg_of(row)
        ready = readiness(tier, row)

        t1_sub, t1_body = touch1(tier, row, first, company)
        t2 = (f"re: {t1_sub}", assemble(render(T2_BODY, first, company), SIG_MIN))
        t3 = (T3_SUBJECT, assemble(render(T3_BODY, first, company), SIG_MIN))
        t4 = (T4_SUBJECT, assemble(render(T4_BODY, first, company), SIG_MIN))
        reply_ask = render(REPLY_ASK, first, company)
        touches = {1: (t1_sub, t1_body), 2: t2, 3: t3, 4: t4}

        base = dict(
            email=row.get("email", "").strip(), first_name=first, company=company,
            contact_title=row.get("contact_title", "").strip(), segment=seg, tier=tier,
            source=row.get("source", "").strip(), email_trust=row.get("email_trust", "").strip(),
            send_readiness=ready, from_name=FROM_NAME, from_email=FROM_EMAIL, reply_to=REPLY_TO,
        )

        for t in (1, 2, 3, 4):
            sub, body = touches[t]
            long_rows.append({**base, "touch": t, "send_day": SEND_DAYS[t],
                              "subject": sub, "body": body})

        wide = dict(base)
        for t in (1, 2, 3, 4):
            sub, body = touches[t]
            wide[f"t{t}_send_day"] = SEND_DAYS[t]
            wide[f"t{t}_subject"] = sub
            wide[f"t{t}_body"] = body
        wide["reply_calendar_ask"] = reply_ask
        wide_rows.append(wide)

    # ---- write long ----
    long_cols = ["email", "first_name", "company", "contact_title", "segment", "tier",
                 "source", "email_trust", "send_readiness", "from_name", "from_email",
                 "reply_to", "touch", "send_day", "subject", "body"]
    with open(os.path.join(OUT, "sequences_long.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=long_cols)
        w.writeheader()
        w.writerows(long_rows)

    # ---- write wide ----
    wide_cols = ["email", "first_name", "company", "contact_title", "segment", "tier",
                 "source", "email_trust", "send_readiness", "from_name", "from_email", "reply_to"]
    for t in (1, 2, 3, 4):
        wide_cols += [f"t{t}_send_day", f"t{t}_subject", f"t{t}_body"]
    wide_cols.append("reply_calendar_ask")
    with open(os.path.join(OUT, "sequences_wide.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=wide_cols)
        w.writeheader()
        w.writerows(wide_rows)

    return contacts, long_rows, wide_rows


def summarize(contacts, long_rows, wide_rows):
    from collections import Counter
    by_ready = Counter(r["send_readiness"] for r in wide_rows)
    by_tier = Counter(r["tier"] for r in wide_rows)
    by_seg = Counter(r["segment"] for r in wide_rows)
    print(f"Unique contacts: {len(wide_rows)}  |  long rows (contacts x 4 touches): {len(long_rows)}")
    print("\nBy send_readiness:")
    order = ["ready", "verify_email", "verify_domain", "optional", "needs_name"]
    for k in order:
        if by_ready.get(k):
            print(f"  {k:14} {by_ready[k]}")
    print("\nBy tier:", dict(by_tier))
    print("By segment:", dict(by_seg))

    # integrity: no leftover merge braces, no empty merged names in sendable bodies
    leftover = [r["email"] for r in long_rows if "{" in r["body"] or "{" in r["subject"]]
    print(f"\nIntegrity — rows with leftover '{{' : {len(leftover)} {leftover[:5]}")
    blankfirst = [r["email"] for r in wide_rows if not r["first_name"]]
    print(f"Integrity — contacts with blank first_name (excluded from send): {len(blankfirst)} {blankfirst}")


if __name__ == "__main__":
    c, l, w = build()
    summarize(c, l, w)
    print(f"\nWrote: {os.path.relpath(os.path.join(OUT, 'sequences_long.csv'))}")
    print(f"Wrote: {os.path.relpath(os.path.join(OUT, 'sequences_wide.csv'))}")
