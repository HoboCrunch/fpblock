# FP Block — Round-2 Cold Outreach Strategy Hub

> **Goal: book remote intro calls** with web3 companies that recently raised, and convert them into FP Block
> engineering clients. **WE NEED MEETINGS.** This hub is the research-driven, best-practices system to get them.
> *No emails have been sent. Everything here is drafts + lists for review.*

---

## TL;DR — the strategy in five sentences

1. **Who:** **976 web3 companies** that just raised (578 round-1 + 398 net-new merged & deduped, June 2026) —
   tiered into **471 sendable** prospects (P1–P3) + 22 low, **57 to review**, and 426 held (M&A/IPO / no email).
2. **What we sell:** not "blockchain dev" — **correctness under permanence**: the engineering for systems
   where being wrong is irreversible (money moves and can't be clawed back). *If it sounds real without the
   word "blockchain," it is real.*
3. **The hook:** their **raise + what it's for**, paired with **their product's specific irreversible failure
   mode**, sent from **Aaron Contorer** (ex-Microsoft, ran Visual C++, advised Bill Gates) — the pedigree is
   our single best trust asset in a scam-saturated market.
4. **The method:** plain-text, <80-word, "you"-led emails with **one soft CTA** ("worth a look?"), a **4-touch
   sequence over 2 weeks**, then multichannel (LinkedIn → X/Telegram).
5. **The bar:** segmented + triggered + founder-signed should land **5–12% replies** and **~1–4% meetings** —
   realistically **~10–15 meetings** from email alone before multichannel/warm-intro lift.

---

## Read in this order

| # | Doc | What it covers |
|---|---|---|
| 01 | [01-fp-block-positioning.md](01-fp-block-positioning.md) | **(A) The business** — what FP Block is, the proof stack, the non-negotiable language rules |
| 02 | [02-icp-and-segmentation.md](02-icp-and-segmentation.md) | **(B) The customers** — ICP test, data snapshot, scoring model, 6 buckets, 5 message segments |
| 03 | [03-cold-email-playbook.md](03-cold-email-playbook.md) | **(C) Best practices applied** — deliverability, craft, cadence, personalization, multichannel, compliance |
| 04 | [04-sequences-and-copy.md](04-sequences-and-copy.md) | **(D) The actual emails** — ready-to-send sequences per segment, DM scripts, P1 personalization |
| — | [research/fp-block-intel.md](research/fp-block-intel.md) | Sourced company intel (verified vs. flagged) |
| — | [research/cold-email-best-practices.md](research/cold-email-best-practices.md) | Sourced 2026 outreach benchmarks |
| — | [sends/](sends/) | The tiered, tagged CSV send lists (see below) |

---

## The send lists (`sends/`) — combined round-1 + round-2

Every row tagged with `segment`, `priority_score`, and `source` (`round1` | `round2_new`). Full merged master:
`docs/data/round-2/lists/FP_Block_MASTER_combined.csv` (976 rows).

| File | n | Use |
|---|---:|---|
| `p1_priority.csv` | 121 | **Send first.** ICP-3 + ≥$5M + verified + named. Fully personalized → `p1_priority_personalized.csv` (all 121 have a custom opener). |
| `p2_strong.csv` | 195 | High-ICP, verified, named. Segment template + product-noun merge. |
| `p3_broad.csv` | 155 | Qualifying + email present. **Verify unverified emails before sending.** |
| `p4_low.csv` | 22 | Weak fit (gaming/social/consumer). Optional. |
| `round2_additions.csv` | 79 | **The net-new sendable companies only** (34 P1 + 43 P2 + 2 P3) — send to just the new ones without re-touching round-1. |
| `hold_review.csv` | 57 | Net-new with an **uncertain org match** (common-name collisions, e.g. "Range"). **Verify the domain before sending** — see `org_flag`. |
| `hold_disqual.csv` | 129 | M&A/IPO/public sale — **exclude** from cold send. |
| `hold_noemail.csv` | 297 | No email (262 net-new) — route to **LinkedIn/X/Telegram** (DM scripts in doc 04). |

Regenerate any time (from repo root): `python3 scripts/combine_and_segment.py` (merges round-1 + net-new and
re-tiers the full set). `scripts/segment.py` is the round-1-only version; `scripts/enrich_orgs.py` is the
Apollo org-enrichment used to add contacts to net-new companies.

---

## Decisions locked (per your input)

- **Sender:** Aaron Contorer — **Founder & CEO** (confirmed — this is a recent appointment; public sources
  haven't caught up yet). We still lead with the verifiable Microsoft/FP Complete pedigree as the trust hook.
- **Goal:** **remote intro calls** (no event deadline). Soft interest CTA cold → 15-min call after they reply.
- **Sending infra:** **SendGrid** (confirmed). Deliverability guardrails for using it well are in
  [03 §1](03-cold-email-playbook.md#1-deliverability--the-silent-killer-do-this-before-sending-anything).
- **Proof points:** Levana ("$1B+") and Six Sigma Sports ("regulated, −95% cost") are **approved** for external use.
- **Language:** lead with permanence/irreversibility/cost-of-being-wrong; **never** lead with
  blockchain/DeFi/Web3/smart-contract jargon. The CSV's built-in "FP Block Outreach Angle" column violates
  this — **do not use it.**

---

## Pre-launch checklist (do NOT send until all green)

- [ ] **Separate cold domain** bought (e.g. `fpblock.io` / `getfpblock.com`) — *not* gofpblock.com.
- [ ] **SPF + DKIM (2048-bit) + DMARC** configured and green; DMARC at `p=none`.
- [ ] Domain **warmed 2–4 weeks**; mailboxes ready (3–5 mailboxes @ 30–50/day if doing ~150/day).
- [ ] **P3 unverified emails verified** (bounce <2%); re-tier any that fail.
- [ ] **Compliant footer + one-click opt-out** wired; **Legitimate Interest Assessment** documented (EU).
- [ ] **Open-tracking pixel OFF** on touch #1; custom click-tracking domain if used.
- [ ] **Reply-handling owner assigned** (replies stop the sequence → human within hours).
- [ ] **SendGrid configured for cold** — dedicated subuser + dedicated IP + the separate cold domain (never
      the brand domain/shared IP); throttled to 20–50/mailbox/day; tracking pixel OFF on touch #1.
      *(See [03 §1](03-cold-email-playbook.md).)*
- [ ] **P1 personalized openers reviewed** by a human before send.

---

## Recommended rollout

1. **Week 0:** stand up domain + warmup; verify P3 emails; finalize/QA P1 personalized openers.
2. **Week 2–3 (post-warmup):** launch **P1 (87)** in cohorts of ≤50, 4-touch sequence, measure reply/meeting
   by segment.
3. **Week 3–4:** launch **P2 (152)** with the best-performing segment hooks from P1.
4. **Week 4+:** launch **P3 (153, verified)**; run **multichannel** on Hold-NoEmail + non-repliers.
5. Continuously: A/B the touch-#1 hook per segment (backlog in [04](04-sequences-and-copy.md)); double down
   on the highest-converting "cost of being wrong" angle.

---

## Open items to confirm
- **Cold sending domain** — pick the separate domain to send from (e.g. `fpblock.io` / `getfpblock.com`); do
  **not** send from gofpblock.com. SendGrid is the platform; the domain choice is still open.
- **P3 email verification** — run the 157 unverified P3 emails through a verifier before send (bounce risk).
