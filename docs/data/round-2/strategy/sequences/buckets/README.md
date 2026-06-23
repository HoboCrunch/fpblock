# Send Buckets — Round-2 Sequences Ledger

Source: [`../sequences_long.csv`](../sequences_long.csv) — 540 contacts × 4 touches = 2,160 emails.

Each touch is split into **two balanced halves** (pt1 / pt2) of 270 → **8 batches**. Bodies are
HTML-ready (plain text + `<br>` on send); each signoff ends on the `FP Block` hyperlink to
`https://fpblock.com` with no footer/credential tail.

## How the split works

- **Contact-consistent:** a given person is in the *same* part (pt1 **or** pt2) across all four
  touches, so they always travel in one sending wave and receive a coherent 4-touch sequence.
- **Tier-balanced:** alternating split keeps each half with a representative P1–P4 / REVIEW mix.
- **pt1 ⨯ pt2 are disjoint** and together cover all 540 contacts per touch.

## Cadence

Touches use day offsets relative to that contact's touch-1 send: **T1 = day 0, T2 = day 3,
T3 = day 7, T4 = day 14.** Send a contact's next touch only after their prior touch's offset has
elapsed. pt1 and pt2 can go same-day or be staggered a day apart for warm-up.

> Sender: **Aaron Contorer `<aaron@gofpblock.com>`** (reply-to same). Send as **HTML** so the
> `FP Block` signoff link renders. Domain auth (DKIM) on `gofpblock.com` is valid; DMARC is `p=none`.

---

## Ledger

Status key: ⬜ not sent · 🟡 in progress · ✅ sent · ⚠️ issue

| Batch | Touch | Part | Send-day offset | Recipients | Status | Date sent | Sent by | Bounces / notes |
|-------|:-----:|:----:|:---------------:|:----------:|:------:|-----------|---------|-----------------|
| `touch-1-pt1.csv` | 1 | 1 | day 0  | 159/270 | 🟡 | 2026-06-23 | Aaron Contorer (aaron@gofpblock.com) | 159 `ready` sent (P1×60, P2×96, P3×3), all 202. 110 held: 73 verify_email + 26 verify_domain + 11 optional. 1 `needs_name` excluded. Tracking off, no footer. Receipt log: `send-logs/touch-1-pt1.sent.jsonl`. T2 due day 3 (≥2026-06-26). |
| `touch-1-pt2.csv` | 1 | 2 | day 0  | 160/270 | 🟡 | 2026-06-23 | Aaron Contorer (aaron@gofpblock.com) | 160 `ready` sent (P1×60, P2×96, P3×4), all 202. 107 held: 70 verify_email + 26 verify_domain + 11 optional. 3 `needs_name` excluded (incl. `tbd` email in verify_email). Disjoint from pt1. Tracking off, no footer. Receipt log: `send-logs/touch-1-pt2.sent.jsonl`. T2 due day 3 (≥2026-06-26). |
| `touch-2-pt1.csv` | 2 | 1 | day 3  | 270 | ⬜ |  |  |  |
| `touch-2-pt2.csv` | 2 | 2 | day 3  | 270 | ⬜ |  |  |  |
| `touch-3-pt1.csv` | 3 | 1 | day 7  | 270 | ⬜ |  |  |  |
| `touch-3-pt2.csv` | 3 | 2 | day 7  | 270 | ⬜ |  |  |  |
| `touch-4-pt1.csv` | 4 | 1 | day 14 | 270 | ⬜ |  |  |  |
| `touch-4-pt2.csv` | 4 | 2 | day 14 | 270 | ⬜ |  |  |  |

**Total: 2,160 emails across 8 batches.**

---

## Batch composition (reference)

| Batch | P1 | P2 | P3 | P4 | REVIEW | Total |
|-------|:--:|:--:|:--:|:--:|:------:|:-----:|
| `touch-1-pt1.csv` | 60 | 96 | 78 | 11 | 25 | 270 |
| `touch-1-pt2.csv` | 60 | 96 | 77 | 11 | 26 | 270 |
| `touch-2-pt1.csv` | 60 | 96 | 78 | 11 | 25 | 270 |
| `touch-2-pt2.csv` | 60 | 96 | 77 | 11 | 26 | 270 |
| `touch-3-pt1.csv` | 60 | 96 | 78 | 11 | 25 | 270 |
| `touch-3-pt2.csv` | 60 | 96 | 77 | 11 | 26 | 270 |
| `touch-4-pt1.csv` | 60 | 96 | 78 | 11 | 25 | 270 |
| `touch-4-pt2.csv` | 60 | 96 | 77 | 11 | 26 | 270 |

> pt1 and pt2 contain the same people in every touch, so per-touch tier counts are identical
> across touches by design.

---

## Wave-2 follow-up sends — touch-1 held set (status: ⏸ verify_email PAUSED 2026-06-23)

After the 319 `ready` went out, we worked the held (uncertain) contacts from touch-1 pt1+pt2.
Sender: **Aaron Contorer `<aaron@gofpblock.com>`**, tracking off. Recipient lists live alongside this
file (`wave2-*.csv`); receipts + reports in [`send-logs/`](send-logs/).

### ✅ Readiness re-tagged across ALL buckets (2026-06-23)

`send_readiness` was updated in every touch-1…4 / pt1+pt2 file so the verified set is sendable for the
rest of the sequence (`email_trust` left intact for provenance):

- **75 promoted → `ready`** = 47 `verify_domain` confirmed + 28 `verify_email` that actually delivered
  (sent without bouncing — delivery is the strongest verification).
- **19 confirmed-dead → `bounced`** (incl. 3 that were originally `ready`) so T2–T4 won't re-hit them.
- **Sendable `ready` universe is now 391 per touch** (was 319). pt1: 207 ready / 18 bounced; pt2: 184 / 1.

### What was sent / held

| Held category | n | Method | Result |
|---|---:|---|---|
| `verify_domain` | 52 | Auto company-match (homepage vs company name) | **47 sent, 0 bounces.** 2 dropped (wrong-company collisions). 3 unreachable held. |
| `verify_email` | 142 | SMTP probe (blocked: port 25), then staged mx_ok send | **44 sent → 36% bounce 🔴 → HALTED.** 88 mx_ok + 10 non-mx_ok **paused**. |
| `optional` | 22 | — | Untouched (weak ICP fit). |
| `needs_name` | 4 | — | Not emailable (no first name) → LinkedIn/X track. |

- **Dropped (wrong company):** `mmishra@yipitdata.com` ("ILITY"→YipitData), `claudio.piccoli@uniavan.edu.br` ("Avantis"→Uniavan university).
- **verify_domain unreachable (held):** `sumit@inference.in`, `dave@open-trade.io` (domain labels match — likely OK), `umeshp@connetin.in` (needs eyes).

### Bounce / health snapshot (2026-06-23, all touch-1 sends)

| Set | Sent | Bounces | Rate |
|---|---:|---:|---:|
| `ready` (pt1+pt2) | 319 | 3 | 0.9% ✅ |
| `verify_domain` confirmed | 47 | 0 | 0.0% ✅ |
| `verify_email` batch 1 (mx_ok) | 44 | 16 | 36.4% 🔴 |
| **total** | **410** | **19** | **4.6%** |

Plus 4 blocks (`tyler@gemini.com` policy, `fauzi@triv.co.id` sender-blocked, 2 transient MX timeouts).
Bad addresses are auto-suppressed by SendGrid. Detail: [`send-logs/touch-1-bounce-snapshot.csv`](send-logs/touch-1-bounce-snapshot.csv).

### ⏸ Paused — resume points (decide later)

- **88 mx_ok `verify_email` remain unsent** in `wave2-verifyemail-mxok.csv` (44 of 132 sent; sender skips already-sent rows via `send-logs/wave2-verifyemail-mxok.sent.jsonl`). **Do NOT send as-is — 36% bounce.** Run through a real verifier (SendGrid Email Validation add-on ≈ $1, or ZeroBounce/NeverBounce), send only valid.
- **10 non-mx_ok `verify_email`** (6 A-only, 3 role accounts, 1 dead domain `ethan.cole@sparkchain.ai`) — skip or verify.
- **22 `optional` + 3 `verify_domain` unreachable + 4 `needs_name`** — untouched.
- Validity reports: [`send-logs/touch-1-held-validity.csv`](send-logs/touch-1-held-validity.csv), [`send-logs/touch-1-verify-domain-match.csv`](send-logs/touch-1-verify-domain-match.csv).
