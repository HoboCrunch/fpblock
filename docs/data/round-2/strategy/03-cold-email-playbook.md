# 03 — Cold Email Playbook (FP Block, 2026)

> **Purpose:** The operating rules. Every number here is from current (2025–2026) research; the full sourced
> report is in [research/cold-email-best-practices.md](research/cold-email-best-practices.md). This page is
> the *applied* version — what we actually do.

---

## The one-paragraph doctrine

The **list + trigger does ~80% of the work** (done — see [02](02-icp-and-segmentation.md)). Deliverability is
table-stakes that silently kills everything if you get it wrong. Copy: **under 80 words**, plain text,
**one soft interest-based CTA** ("worth a look?" — beats a hard meeting ask ~3× cold), 5th-grade reading
level, mobile-first, "you"-led. Run a **4-touch sequence over ~2 weeks** with short bumps, then go
multichannel (LinkedIn → X/Telegram). For this crypto audience, **lead with trust signals** (Aaron's pedigree)
because the community is scam-saturated, and **never cold-open on Telegram**.

---

## 1. Deliverability — the silent killer (do this BEFORE sending anything)

None of the copy matters if you're in spam. Mandatory plumbing:

- **Use a separate sending domain — NOT gofpblock.com or the primary brand domain.** One spam complaint on
  the brand domain poisons transactional/sales/support mail forever. Buy a look-alike (e.g. `fpblock.io`,
  `getfpblock.com`, `fp-block.com`) and send cold from there.
- **Authenticate: SPF + DKIM (2048-bit) + DMARC.** Start DMARC at `p=none`, move to `p=quarantine` after ~30
  clean days. Google/Yahoo/Microsoft all require aligned SPF+DKIM+DMARC now, regardless of volume.
- **Warm up 2–4 weeks** before real volume. Ramp ~5–10/day (wk1) → 15–25 (wk2) → 30–50 (wk3+). Keep an
  automated warmup running as maintenance.
- **20–50 cold emails per mailbox per day. Hard ceiling.** The reply-rate cliff is brutal: 20–49/day →
  ~5.7% reply / 88% inbox; 200+/day → ~0.6% reply / 31% inbox. To do ~150/day, run **3–5 mailboxes** at
  30–50 each, not one mailbox at 150.
- **Spam complaints < 0.10%; never hit 0.30%** (auto-block territory). **Bounces < 2%** (ideally <1%) — this
  is why the 157 unverified P3 emails **must be verified before sending.**

### ⚠️ Using SendGrid for cold (it's the chosen platform — here's how not to torch deliverability)
SendGrid is built for *transactional/marketing* mail and pools sender reputation, so cold outreach needs extra
care. Mandatory setup:
- **Dedicated subuser + dedicated IP + the separate cold domain** — never the brand domain or a shared IP
  (shared IPs inherit other senders' spam reputation).
- **Authenticate that cold domain in SendGrid** (Sender Authentication → domain CNAMEs for SPF/DKIM) and add
  DMARC; warm the dedicated IP per SendGrid's ramp schedule.
- **Throttle to 20–50/mailbox/day** via scheduled sends — do **not** blast 414 in a batch.
- **Turn OFF open-tracking and click-tracking on touch #1** (Mail Settings / per-send) — SendGrid's tracking
  rewrites links through `sendgrid.net`, which reads as sales/phishing mail to filters.
- **Send as plain text** (not a designed template) so it looks 1:1, not like a marketing blast.
- **Watch the SendGrid Deliverability dashboard** — keep spam complaints <0.1% and bounces <2%; pause the
  campaign if either climbs.

---

## 2. Message craft — the rules each email must pass

- **Length: 25–50 words ideal, <80 hard cap.** 150+ words is ~42% *less* likely to get a reply. (Longer is
  only ok for follow-ups, never the opener.)
- **Subject: 2–4 words, 21–40 chars, lowercase-ish, sounds like internal mail.** Trigger-personalized
  subjects open best (~55%). Avoid "your," urgency words, ALL CAPS, jargon. Good: `quick question` ·
  `re: your raise` · `liquidation engines` · `after the round`.
- **Open with THEM, never "I'm Aaron / I'm the founder of…".** Self-intro openers pattern-match to spam.
  First line = their world / their trigger.
- **Lead with their problem, not our solution.** "Lecture tone" cuts replies ~26%. Don't over-claim ROI in
  touch #1 (ROI language *decreased* success ~15% in cold).
- **ONE soft, interest-based CTA. No calendar ask cold.** "Worth a look?" / "Is this on your radar?" /
  "Open to a couple examples?" beats "15 min Tuesday?" by ~3× at the cold stage. Save the calendar ask for
  *after* they reply (then a specific time converts best).
- **One question only. 1–2 sentence paragraphs. 5th-grade reading level.** ("No big paragraphs" → +83%
  replies; 5th-grade → +67%.)
- **Plain text, ≤1 link, no images/attachments, no emojis in the first touch** (crypto scam-sensitivity).

---

## 3. The sequence — 4 touches over ~2 weeks

| Touch | Day | Job | Length |
|---|---|---|---|
| **#1** | 0 | Trigger + segment "cost of being wrong" hook + soft CTA | 25–50 words |
| **#2** | 3 | Proof / credibility (Aaron pedigree + 1 relevant case) + soft CTA | <60 words |
| **#3** | 7 | New angle — a "pressure mirror" reframe, different door in | <50 words |
| **#4** | 14 | Break-up bump — short, FOMO, easy out | <25 words |

- **Spacing 3–4 days.** Next-day follow-ups *reduce* replies 11%; 3-day gaps *increase* them 31%.
- **Follow-ups matter:** ~42% of replies and ~70% of *meetings* come from touch #2+. The break-up email often
  gets the highest single-touch response (~14%).
- **Bumps beat re-pitches** (~4.5× lift). A bump is *short* — "if your bump is longer than the original
  email, it's a second cold email."
- **Stop on reply.** Move a responder out of the sequence into a human, 1:1 thread immediately.

---

## 4. Personalization — the relevance bar in the post-AI-slop era

The gap is ~9×: generic token merge ("Hi {first}, saw {company}…") ≈ 1% reply; **signal-anchored relevance**
≈ 9–30%. Rules:

- **Real personalization = relevance to a specific recent business event**, not first-name tokens. Our event
  is *the raise + what it's for*, plus *their specific product's failure mode*.
- **"I saw your post / loved your tweet" now actively hurts** — prospects pattern-match it as cold in ~2
  seconds. Don't fake-compliment.
- **Hybrid wins:** AI research + human-quality writing reply at ~14.7% vs AI-only ~4.1%. Don't let it *read*
  like AI (47% of buyers reply less if it sounds AI-generated, even though most don't mind AI use).
- **Personalization decays across the sequence:** touch #1 carries the personalized hook; #2 adds proof; #3–4
  are short and mostly templated. Re-personalizing every touch reads as desperate.
- **Per-tier reality:**
  - **P1 (87):** genuinely personalized first line, grounded in *their* product's specific risk (we generate
    these — see `sends/p1_priority_personalized.csv`).
  - **P2 (152):** segment hook + their product noun via merge field. ~80% of the lift, fraction of the effort.
  - **P3 (153):** clean segment template, merge fields only. Verify emails first.

---

## 5. Multichannel — essential for a crypto audience

Crypto founders/CTOs live on **X and Telegram**, not their inbox. Multichannel lifts response up to ~287%
over single-channel; LinkedIn DMs reply ~10% vs ~5% email.

**Sequence the channels:** Email #1–2 → **LinkedIn** connect + light touch → **X/Telegram** DM as a warm
follow-up to email intent. (Scripts in [04](04-sequences-and-copy.md).)

**Crypto etiquette (ignore at your peril):**
- **Never cold-open on Telegram** — that's where scams live; DM only as a follow-up to an email they've seen.
- First DM <70 words, casual, **no links/attachments/PDFs/emojis**, one low-friction yes/no ask.
- **Trust signals lower suspicion:** real name + short signature, sending domain matches the website, one
  specific offer, easy opt-out. **Raise suspicion (never do):** guaranteed-returns language, link shorteners,
  attachments, urgency + "limited-time," impersonating an investor/exchange.
- **Verify handles out-of-band** — impersonators clone names with a one-char swap. Start from the project's
  official site.

---

## 6. Compliance — cold B2B email is legal in US + EU (do these 3 things)

Many prospects are European (and EthCC is in France) — but cold B2B is fine if you:

1. **Identify yourself + include a valid physical postal address** (CAN-SPAM; CNIL).
2. **Give a one-click, honored opt-out.** Honor US opt-outs ≤10 business days; **EU within 24–48h.**
3. **Have a legitimate-interest basis** — message must relate to their professional role (it does: we engineer
   the kind of system they run). Document a one-page Legitimate Interest Assessment (LIA); regulators fine the
   *documentation gap*, not the sending.

- **US (CAN-SPAM):** no B2B exemption; max penalty headline is scary ($53,088/email) but enforcement targets
  volume spammers, not targeted B2B.
- **EU (GDPR/CNIL):** B2B prospecting to professionals needs **no prior consent** — legitimate interest +
  opt-out suffices. Role addresses (info@) are exempt; personal pro addresses (jane@) carry a right to object.
- **Germany is strictest** (near-consent required); be more conservative with `.de` contacts.

**Compliant footer (satisfies US + EU + UK):**
```
FP Block · [valid street address], [City, Country]
You're getting this because you lead engineering at a company building systems where correctness matters,
and that's what we do. Found you via [LinkedIn/your raise announcement].
Not relevant? Reply "stop" and I'll remove you immediately. · [unsubscribe link]
```

---

## 7. Targets & instrumentation

- **Optimize for REPLY rate, not opens** (Apple Mail inflates opens ~40–50%; the metric is junk in 2026).
- **Track:** sends, bounces (<2%), spam-complaint rate (<0.1%), reply rate, positive-reply rate, meetings
  booked, by **segment and tier** (so you learn which "cost of being wrong" angle converts).
- **A/B the touch-#1 hook per segment** once you have volume; hold everything else constant.
- **Segment cohorts ≤50** reply ~2.8× better than 1,000+ blasts — send in small, tagged batches.

> **Launch gate:** don't send until (1) separate domain warmed, (2) SPF/DKIM/DMARC green, (3) P3 emails
> verified, (4) footer + opt-out wired, (5) reply-handling owner assigned. Checklist lives in the
> [README](README.md).
