# Research — B2B Cold Outreach to Web3 Founders/CTOs (Post-Funding), 2026 Playbook

> Sourced, benchmarked web research. Distilled into [03-cold-email-playbook.md](../03-cold-email-playbook.md).
> Source-quality note at the bottom. Compiled June 2026.

**One-paragraph version:** Your list and trigger do ~80% of the work — a recent raise lifts reply rates ~3–5×
over untriggered cold. Deliverability is table-stakes that silently kills everything: separate sending domain,
SPF/DKIM/DMARC, 20–50 sends/mailbox/day, 2–4 week warmup. Copy: under ~80 words (ideally 25–50), plain text,
one soft interest-based CTA ("worth a look?" beats a hard meeting ask ~2.5–3× cold, per two independent
large-N datasets), 5th-grade reading level, mobile-first. Run a 4-touch sequence over ~2 weeks with short
bumps, then go multichannel. For crypto, email is the cold-open but **X and Telegram are where these people
live** — use DMs as a warm follow-up, never the cold-open, and lead with trust signals. Cold B2B email is
legal in the US (CAN-SPAM) and EU/France (CNIL legitimate-interest) with identification, an address, and
honored opt-outs.

---

## 1. Deliverability & infrastructure (the silent killer)
- **SPF + DKIM + DMARC required**, not optional (Google bulk-sender rules; min DMARC `p=none` → `quarantine`
  after ~30 clean days). DKIM 2048-bit. Mind the SPF 10-DNS-lookup limit.
- **Never send cold from the primary brand domain** — use a dedicated secondary/look-alike domain. Subdomains
  only partially isolate reputation (Postmaster tracks at root level); above ~50/day use separate domains.
- **Warm up 2–4 weeks** (6–8 cautious). Ramp wk1 5–10/day → wk2 15–25 → wk3 30–50 → steady; keep warmup
  running as maintenance.
- **20–50 cold emails/mailbox/day.** The cliff (Woodpecker, ~20M emails): 20–49/day → **5.7% reply / 88%
  inbox**; 50–99 → 3.1% / 71%; 100–199 → 1.4% / 52%; 200+ → 0.6% / 31%. Scale via *more mailboxes/domains*,
  not higher per-mailbox volume ("5 mailboxes × 80/day ≪ 1 mailbox × 400").
- **Bulk-sender thresholds** (Google/Yahoo Feb 2024; Microsoft May 5 2025) trigger at 5,000+/day/provider, but
  **auth + spam-rate rules apply to everyone.** Spam complaints **<0.10%, never 0.30%.**
- **Content:** plain text > HTML (HTML bounces more, looks bulk; plain text ~15–25% more replies — directional,
  not a controlled study). **≤1 link.** Images ~neutral but skip them in 1:1. **Turn off open-tracking pixels
  on touch #1** (signals sales mail; Apple inflates opens ~40–50% anyway); if tracking clicks, use a custom
  tracking domain.
- **List hygiene:** bounce <2% (post-2025, <1% expected) — **verify every list before sending.** Spam-word
  lists matter far less than reputation/context now; still avoid ALL CAPS, "free," "guaranteed," "act now."

## 2. Targeting & timing triggers (highest-leverage decision)
- Funded companies are **3–5× more likely to buy software within 12 months**; funding-based lists reply at
  **8–15% vs 2–5%** generic; deals close 20–40% faster.
- **Freshness:** outreach within first 30 days → 3–5× higher response *vs. untriggered*; the optimal *selling*
  window is **weeks 3–12** (planning → vendor selection); after day 60–90 budgets are allocated. **Anchor on
  what the money is FOR**, not "congrats."
- **Job/leadership changes are the single strongest trigger** (~14% vs 1.2%). Stacking signals → 2–4×.
  Five minutes of account research lifts replies 3–5×.

## 3. Personalization at scale (post-AI-slop)
- The gap is ~9×: generic token personalization → ~1% reply; trigger-based relevance → ~9% (tiered: generic
  1–3%, firmographic 5–8%, signal-anchored **15–30%**).
- **"I saw your LinkedIn post / loved your post" now actively hurts** (pattern-matched as cold in ~2s).
- Buyers reject AI *sound*, not AI use (67% don't mind AI-written; 47% reply less if it *reads* AI). **Hybrid
  (AI research + human writing) wins:** 14.7% reply vs 4.1% AI-only / 10.4% human-only (Saleshandy).
- **Personalization decays across the sequence** — #1 carries the hook, #2 proof, #3 short bump.

## 4. Message craft
- **Length:** 20–39 words optimal (4.5% reply, Hunter 34M); <100 beats longer; **150+ words ~42% less likely
  to get a reply.** Longer is fine *only* for follow-ups (Gong: 4+ sentence follow-ups → 15× more meetings).
- **Subject:** 2–4 words / 21–40 chars wins (46–49% open); trigger-personalized tops at 54.7%; sound like
  internal mail; avoid "your," urgency, ALL CAPS, jargon.
- **Open with the prospect, not "I'm…".** Lead with their problem (lecture tone −26% replies). **Don't
  over-claim ROI in touch #1** (Gong: ROI language −15%). Slightly casual/hedged tone +23%.
- **CTA — best-evidenced lever:** **interest-based CTA wins cold** (Gong, 304,174 emails: ~15% to meetings;
  specific-time asks underperform — loss aversion). Flips once engaged (deal stage: specific-time 37% > open
  32% > interest 25%). Replicated by Puzzle Inbox (200K+): soft 4.2% > medium 3.1% > hard 1.4%. **Use ONE
  CTA** (single-CTA = 371% more clicks); keep it <15 words.
- **Readability:** 3rd–5th grade → +67% replies; no big paragraphs → +83%; **exactly one question**; **81% of
  cold email is read on mobile** — preview on a phone.

## 5. Sequences & cadence
- **4–7 touches** (under 4 gives up; over 7 diminishing). Front-load: 1st follow-up +49% replies, 2nd +3%;
  4th follow-up −55% and spam complaints climb 0.5%→1.6%.
- **Space 3–4 days** (next-day −11%; 3-day +31%). Clean cadence: **Day 0 → 3 → 7 → 14.**
- 58% of replies from email #1; 42% from follow-ups — **but ~70% of *meetings* come from touch #3+.**
- **Bump emails:** short re-touch went 2.5% → 11.4% (~4.5×); keep <30 words; clear-CTA bump (12%) > soft
  re-pitch (6%).
- **Multichannel:** email-only ~4–6% → +LinkedIn ~8–10% → +phone ~10–12%; 3+ channels up to ~287% more
  responses; LinkedIn DMs ~10.3% vs ~5.1% email. **Break-up email** ~14% response.
- **Benchmarks:** avg cold reply ~3.43% (2026); good 5–10%, excellent 10–15%; good positive-reply 3–5%;
  founders/CEOs reply highest (~7.6%) but most quality-sensitive. **Meetings booked: 1–3% of contacts is
  strong, 4–6% top.** Cohorts ≤50 reply ~2.76× better than 1,000+ blasts.

## 6. Multichannel for web3 specifically
- **X is the public home of crypto; Telegram is the dominant private channel ("deals start with a DM").** DMs
  open 70–90% within the first hour vs email ~21–25%. Cold X DMs 5–12% response (25–40% warm/triggered).
- **Etiquette:** Telegram DM is a **follow-up to email intent, NOT a cold-open** ("random DMs are where scams
  live"). First DM <70 words, casual, **no links/PDFs/attachments/emojis**, low-friction yes/no ask, follow up
  in 2–3 days.
- **Scam-sensitivity trust stack** — *lower* suspicion: real name + short sig, sending domain matches site,
  one specific offer, easy opt-out, clean SPF/DKIM/DMARC. *Raise* suspicion (avoid): guaranteed returns, link
  shorteners, attachments, impersonation, urgency + "limited-time." Verify handles out-of-band.
- **Warm intros dominate** (10–34% vs 2–10% cold). Conferences manufacture warm intros.

## 7. Compliance
- **CAN-SPAM (US):** no B2B exemption. Need: truthful headers/subject, ad identification, **valid physical
  address**, clear opt-out, **honor within 10 business days**. Max $53,088/email (FTC, eff. Jan 17 2025) —
  enforcement targets volume spammers (largest-ever ~$2.95M).
- **GDPR / CNIL (France):** cold B2B legal via **legitimate interest** (no prior consent) when relevant to the
  recipient's profession; offer easy objection; right-to-object at collection + every message. Role addresses
  (info@) exempt; personal pro addresses carry right-to-object. **Document a Legitimate Interest Assessment.**
  Honor EU opt-outs in **24–48h.** **Germany strictest** (near-consent); Poland often needs consent.
- **UK (PECR):** corporate subscribers emailable without prior consent; sole traders/partnerships treated as
  individuals.

---

## The opinionated 10-point operating playbook
1. **List first** — targeting beats copy every time.
2. **Anchor on the money's *purpose*,** not the raise.
3. **Hit the weeks 3–12 window** (optional light week-1 touch for top accounts).
4. **Separate domain, SPF/DKIM/DMARC, 20–50/mailbox/day, 2–4wk warmup, plain text, ≤1 link, no pixel.**
5. **<80 words, 5th-grade, mobile-first, "you"-led, one question.**
6. **One soft interest CTA cold; calendar ask only after they reply.**
7. **4 touches, 3–4 days apart, with short <30-word bumps.**
8. **Go multichannel: email → LinkedIn/X DM → Telegram-as-follow-up.**
9. **Lead with trust signals; never cold-open on Telegram.**
10. **Use warm intros/events where available** (here, the goal is remote calls, so this is a secondary lever).

---

*Source-quality note: most independently-corroborated — Google/CNIL/FTC primary docs (verified directly),
Gong CTA study (304K emails, verified), Hunter (34M/2.2M), Belkins (16.5M), Woodpecker (~20M), 44M-email
spintax analysis. Treat single-vendor figures (Spredo Telegram rates, 287% multichannel lift, aggressive
funding-freshness stats) as directional upper bounds.*
