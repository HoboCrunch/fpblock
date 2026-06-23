# 04 — Sequences & Copy (ready to send)

> **Purpose:** The actual messages. Every email here passes the [playbook](03-cold-email-playbook.md) rules:
> ≤80 words (T1 ≈ 50), plain text, "you"-led open, one **soft** CTA cold, one question, 5th-grade level,
> on-brand language (stakes not jargon), Aaron's pedigree as the trust anchor.
> **Goal of the whole sequence: book a 15-min remote intro call** — but we never ask for the calendar cold.
> We ask for *interest* ("worth a look?"); the calendar ask comes only **after they reply.**

---

## Sender & signature

**From:** Aaron Contorer — Founder & CEO, FP Block, on the **separate cold domain** (not gofpblock.com).

**Touch #1 signature (credibility-tagged — recommended for cold + crypto trust):**
```
Aaron Contorer
Founder & CEO, FP Block
Ex-Microsoft (built Visual C++, advised Bill Gates) · Founder, FP Complete
```
**Touches #2–4 signature (minimal — pedigree already landed):**
```
Aaron
FP Block
```
Append the [compliant footer](03-cold-email-playbook.md#6-compliance) to every send.

---

## Merge fields

| Field | Source | Notes |
|---|---|---|
| `{{first_name}}` | `contact_name` (first token) | Skip the email if no name (don't send "Hi there"). |
| `{{company}}` | `company` | |
| `{{product_noun}}` | per-segment map below, or P1 personalized | e.g. "exchange", "stablecoin rails", "infrastructure". |
| `{{personalized_line}}` | **P1 only** — `sends/p1_priority_personalized.csv` | Replaces the segment hook in T1. |

**Category → `product_noun` fallback (P2/P3):** Trading&DeFi → "protocol" · Payments&Stablecoins →
"payment rails" · RWA → "platform" · Infra&Chains → "infrastructure" · AI → "system". When unsure, omit the
noun and use `{{company}}`.

---

# TOUCH #1 — by segment (Day 0, ~50 words)

> Opens with *their* world + the raise's purpose, names the segment's **cost of being wrong**, ends on a
> **soft interest CTA**. For **P1**, swap the middle sentence for `{{personalized_line}}`.

### 1 · Trading & DeFi
**Subject:** `after the round`  *(alt: `the first liquidation`)*
```
{{first_name}} — I'll skip the congrats.

You raised to scale {{company}}. The part that bites usually isn't launch — it's the first
liquidation or oracle path that moves money you can't claw back.

We make that path provably correct before production does it for you. Worth a look?
```

### 2 · Payments & Stablecoins
**Subject:** `moving real money`  *(alt: `after the round`)*
```
{{first_name}} — skipping the congrats.

You raised to move more money through {{company}}. At scale, "close enough" stops being a
rounding error and becomes a refund you can't issue — and a compliance conversation you didn't want.

We build money-movement that reconciles exactly, every time. Worth a look?
```

### 3 · RWA & Tokenization
**Subject:** `auditor and a court`  *(alt: `after the round`)*
```
{{first_name}} — skipping the congrats.

You're building {{company}} so a token stands for a real asset. That means the engineering has to
hold up in front of an auditor and a court — not just on testnet.

Closing that gap is exactly what we do. Worth a look?
```

### 4 · Infra & Chains
**Subject:** `when they build on you`  *(alt: `after the round`)*
```
{{first_name}} — skipping the congrats.

You raised to grow {{company}}, which means more teams are about to build on top of you. Past a
point, your edge cases become their outages — and your bugs are permanent in someone else's product.

We harden infrastructure for exactly that moment. Worth a look?
```

### 5 · AI x Crypto
**Subject:** `before it sets`  *(alt: `shipping with AI`)*
```
{{first_name}} — skipping the congrats.

You're shipping {{company}} fast, probably with a lot of AI in the loop. That makes execution
cheap — and the wrong architectural assumption permanent before anyone notices it.

We catch those before they set. Worth a look?
```

---

# TOUCH #2 — proof / credibility (Day 3, <60 words, all segments)

> The pedigree email. This is where Aaron's background does the heavy lifting. One bridge line → pedigree →
> one relevant case → soft CTA (offer *examples*, not a meeting).

**Subject:** `re: {{touch-1 subject}}`  *(threaded reply keeps it in the same conversation)*
```
{{first_name}} — quick context on why I reached out directly.

I ran Visual C++ at Microsoft and advised Bill Gates; my team has spent 500+ engineer-years on
systems where being wrong is expensive. We rebuilt Levana's exchange in under 7 months — it's
cleared over $1B since.

Happy to send two examples close to {{company}}. Want them?
```

---

# TOUCH #3 — the reframe (Day 7, <50 words, all segments)

> A different door in — a "pressure mirror." No hard CTA; it earns the reply by being true, not pushy.

**Subject:** `one thought`
```
{{first_name}} — one thought, then I'll leave it.

Most systems work right up until the moment they have to be trusted. The teams that sleep well
aren't the fastest — they're the ones who made the irreversible parts correct early.

If that's on your mind for {{company}}, I'm around.
```

---

# TOUCH #4 — break-up bump (Day 14, <25 words)

> Often the highest single-touch response (~14%). Short, easy out, no guilt.

**Subject:** `closing the loop`
```
{{first_name}} — assuming the timing's off, so I'll stop here. If the "can't-undo-it" parts of
{{company}} ever get loud, just reply and I'll jump in.
```

---

# After they reply → THEN ask for the calendar

The moment someone shows interest, stop the sequence and go human:
```
Glad it's relevant. Easiest next step: a 15-min call where I walk through the two examples and you
tell me where {{company}}'s irreversible parts actually are. Does Tue or Thu this week work?
```
(At the *engaged* stage, a specific-time ask converts best — the opposite of the cold rule.)

---

# Multichannel scripts (for Hold-NoEmail + as a parallel touch)

> Sequence: email → **LinkedIn** → **X/Telegram** (DM only as a follow-up to email intent — never a cold
> Telegram open). No links, no attachments, no emojis in the first message.

**LinkedIn connect note (<300 chars):**
```
{{first_name}} — not pitching. We rebuild the parts of systems like {{company}} that can't be undone
once they're live (did exactly this for Levana's exchange). Following your work post-raise.
```
**LinkedIn DM after they accept:**
```
Appreciate the connect. Genuine question as you scale {{company}}: who owns the "this-can't-break"
parts of the stack right now? Happy to share how teams in your spot are handling it.
```
**X / Telegram DM (warm follow-up only):**
```
hey {{first_name}} — Aaron from FP Block (ex-Microsoft; my team rebuilt Levana's exchange). not
selling anything in a DM. you just raised to scale {{company}} — curious who's hardening the parts
that can't be undone once funds move. worth a quick swap of notes?
```

---

# P1 personalization — the bar

For all **121 Priority companies**, the T1 middle sentence is replaced by `{{personalized_line}}` — one plain
sentence naming **the specific irreversible failure mode of THAT company's product**, derived from its
summary. No jargon. No fake compliment. It must read like a senior engineer who actually looked.

**Worked examples (real companies from the list):**

- **WasabiCard** (stablecoin↔payments, white-label card-issuing APIs, $10M Series A):
  > "Once WasabiCard is issuing cards and moving payouts *for other businesses* through your APIs, a
  > reconciliation gap stops being your bug and becomes your partners' chargeback."

- **Morpho** (lending, net-new round-2 add — Merlin Egalité, co-founder):
  > "The moment your matching layer mis-sizes a position or a liquidation fires against the wrong rate,
  > lenders' money is already gone and there's no support ticket that brings it back."

- **Polymarket** (prediction markets, net-new — Shayne Coplan):
  > "Every market comes down to one irreversible call — which side was right — and the day a resolution is
  > wrong or gameable, you're paying out the wrong people with no way to claw it back."

> The generated file `sends/p1_priority_personalized.csv` has a `personalized_opener` column for **all 121**
> (87 round-1 + 34 net-new), each QA'd for length + banned jargon. **Review before sending** — personalization
> is the highest-leverage and highest-risk line in the email. Net-new rows (`source=round2_new`) use
> Apollo-found founder emails — spot-check the contact identity, especially any later moved out of
> `hold_review.csv`.

---

# Quick A/B backlog (once you have volume)

1. **T1 subject:** `after the round` vs. segment-specific (`the first liquidation`, `moving real money`).
2. **Signature:** credibility-tagged vs. minimal on T1.
3. **CTA wording:** "Worth a look?" vs. "Is this on your radar?" vs. "Open to two examples?"
4. **Proof case in T2:** Levana ($1B+) vs. Six Sigma Sports (95% cost cut, regulated) — by segment.

Hold everything else constant; change one variable per cohort of ≤50.
