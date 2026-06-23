# 02 — The Customers: ICP Mapping & Segmentation of the 578

> **Purpose:** Turn the raw list into a prioritized, segmented send plan grounded in FP Block's ICP.
> The list (`docs/data/round-2/lists/FP_Block_Outreach_List_enriched.csv`) is **578 web3 companies that
> recently raised**. Recent funding is the single highest-value cold-outreach trigger — funded teams are
> 3–5× more likely to buy software within 12 months, and funding-based lists reply at 8–15% vs. 2–5% for
> generic cold.

---

## Why this list is a near-perfect trigger match

A company that just raised a round to **run a system where other people's money moves** satisfies the ICP
test almost automatically:

- Money is at risk (financial cost of being wrong) ✔
- The system is live and public (persistent, externally visible) ✔
- They just took capital to *scale and ship* — decision pressure is high and budget exists ✔

The money's *purpose* is our hook. They didn't raise to celebrate — they raised to ship something bigger,
faster, with a thin team. That's precisely when "the system has to be right and you don't have time to make
it right" lands. **Anchor on what the money is FOR, never "congrats on the raise"** (everyone sends that).

---

## What's in the list (data snapshot)

- **578 companies**, 543 with an email (344 verified). 555 have a named CEO/CTO contact.
- **Rounds:** Seed 140 · (blank) 105 · **M&A 102** · Pre-seed 47 · Strategic 44 · Series A 41 ·
  Public sale 28 · Series B 12 — plus a long tail.
- **Raise size** (389 parseable): median **$5M**, 220 raised ≥$5M, 74 ≥$20M, 38 ≥$50M. Max $4B (an outlier/
  M&A).
- **Top categories:** Infrastructure 203 · DeFi 159 · AI 129 · Finance/Banking 103 · Payment 97 · Trading 78 ·
  DApp 78 · Stablecoin 68 · RWA 55 · Solana 53 · Asset Mgmt 42 · Prediction Markets 36.
- **Recency:** well-distributed Jul 2025 → Jun 2026, peaking Oct 2025 (69) and Dec 2025 (63), with 60 in
  May 2026 and 56 in Mar 2026.

> **Timing read:** best-practice "selling window" after a raise is weeks 3–12. As of June 2026, raises from
> **~Mar–May 2026** are in the sweet spot (planning → vendor selection). Late-2025 raises are past the
> window but still hold budget and a live system — good for the value/heritage angle rather than the
> "you just raised" angle. **M&A rows are a different motion entirely** (see Hold, below).

---

## The scoring model (how tiers were assigned)

Each company scored on three axes; see `sends/` for the output CSVs.

1. **ICP category strength** (the core axis — "cost of being wrong"):
   - **3 — money-on-the-line / irreversible:** DeFi, derivatives/perps, trading, DEX, lending, yield, asset
     management, prediction markets, **stablecoins, payments, finance/banking,** RWA, custody, CEX.
   - **2 — systems others depend on:** infrastructure, L1/L2, oracles, bridges/interop, wallets, DePIN,
     staking/restaking, data services, identity, modular/rollup.
   - **1 — context-dependent:** AI, analytics, developer tools, privacy/ZK.
   - **0 — lower-stakes / reversible:** gaming, NFT, social, P2E, meme, consumer.
2. **Funding:** ≥$20M = +2, $5–20M = +1, else 0.
3. **Contactability:** verified email +2 / present +1; named contact +1.

**Round-type filter:** Seed / Pre-seed / Series A–F / Strategic / Angel / bridge → qualifying.
**M&A / IPO / public sale / public offering / private placement → disqualified** (wrong buying motion —
budget controlled by an acquirer or the company is in a liquidity event, not a build phase).

---

## The send plan (combined round-1 + round-2)

Counts below are the **merged set: 976 companies** (578 round-1 + 398 net-new deduped, June 2026). Net-new
contributions in parentheses. See "Round-2 net-new" note below for how those were enriched.

| Bucket | n | Definition | Treatment |
|---|---:|---|---|
| **P1 — Priority** | **121** (+34) | ICP-3 + raised ≥$5M + verified email + named contact | **Personalized.** First. All 121 have a custom opener. |
| **P2 — Strong** | **195** (+43) | ICP ≥2 + verified email + named (smaller/unknown raise) | Template + 1 personalized line (segment + their product noun) |
| **P3 — Broad** | **155** (+2) | Qualifying + email present, incl. unverified | Template. **Verify unverified emails before sending** (bounce risk). |
| **P4 — Low** | **22** | Weak ICP fit (gaming/social/consumer) | Optional / deprioritize |
| **Hold — Review** | **57** (+57) | Net-new with **uncertain org match** (common-name collisions) | **Verify domain** (`org_flag`) before promoting to a send tier |
| **Hold — Disqual** | **129** | M&A / IPO / public sale | Exclude from cold send |
| **Hold — No email** | **297** (+262) | No deliverable email | Multichannel/research only (LinkedIn/X/Telegram) |

> Files in `sends/`: `p1_priority(.csv/_personalized.csv)`, `p2_strong.csv`, `p3_broad.csv`, `p4_low.csv`,
> `round2_additions.csv` (net-new sendable only), `hold_review.csv`, `hold_disqual.csv`, `hold_noemail.csv`.
> Each sorted by `priority_score`, tagged with `segment` + `source`. Regenerate with
> `scripts/combine_and_segment.py`.

### Round-2 net-new (how the 398 were added)
The `web3_fundraising_2025_2026.csv` (835 rows) was deduped against round-1 → **398 net-new**, normalized to the
master schema, then the **236 ICP-qualifying** ones were enriched via Apollo org-search (`scripts/enrich_orgs.py`:
company → org → founder/CEO → verified email). Yield: **161 contacts, 136 emails (133 verified)**. The other 162
net-new (low-fit / public-sale / IPO / no funding signal) were skipped — we'd never cold-email them anyway.
**Caveat:** common single-word company names ("Range") can match the wrong org; those 57 are quarantined in
`hold_review.csv` for domain verification before send.

---

## The five message segments (each gets its own "cost of being wrong" angle)

Every sendable company is tagged with one segment. The segment determines the **hook line** in touch #1.

### 1. Trading & DeFi — *178 companies* (36 P1 / 66 P2 / 76 P3)
Perps, derivatives, DEXs, lending, yield, asset management, prediction markets.
- **Cost of being wrong:** a single bug in a liquidation/matching/oracle path can drain the protocol in one
  block; once funds move, it's irreversible; an exploit is public and permanent.
- **Angle:** *"Launching the exchange is the easy part. The hard part is the first liquidation cascade — or
  oracle hiccup — that does something you can't undo."*

### 2. Payments & Stablecoins — *104 companies* (47 P1 / 33 P2 / 24 P3)
Stablecoin rails, payment infra, cards, banking/fintech bridges. **Highest P1 density** — most pass the ICP
test outright.
- **Cost of being wrong:** real money moving at scale, regulators watching, reconciliation must be exact,
  settlement is irreversible, a mistake is a refund you can't issue.
- **Angle:** *"When you're moving real money for other people, 'close enough' becomes a liability you can't
  refund — and a compliance conversation you didn't want."*

### 3. RWA & Tokenization — *8 companies* (1 P1 / 2 P2 / 5 P3)
Real-world-asset platforms, tokenized funds. Small slice but extremely high-fit + legally exposed.
- **Cost of being wrong:** the token is a *legal claim* on a real asset; auditability and enforceability are
  the product; "buggy" = "litigated."
- **Angle:** *"When a token is a claim on a real asset, the engineering has to hold up in front of an auditor
  and a court — not just on testnet."*

### 4. Infra & Chains — *84 companies* (3 P1 / 51 P2 / 30 P3)
Infrastructure, L1/L2, oracles, bridges, wallets/custody, staking, DePIN, data, identity.
- **Cost of being wrong:** other teams build on top of you; your failure propagates to all of them and can't
  be quietly reset; you're an infrastructure steward, accountable for uptime and correctness over years.
- **Angle:** *"Once other teams build on your infrastructure, your edge cases become their outages — and your
  bugs are now permanent in someone else's product."*

### 5. AI x Crypto — *13 companies* (P3 tier; lower verified-contact density)
AI-native crypto, on-chain AI, agent infra, analytics.
- **Cost of being wrong:** shipping fast with AI-generated code locks in architectural assumptions you can't
  see until they're permanent; cheap execution, expensive regret.
- **Angle:** *"AI makes shipping cheap. It also makes the wrong architectural assumption permanent before you
  notice you made it."*

> **Consumer/Gaming/Social (P4, 22):** keep in reserve. Real stakes are lower (failures are usually
> reversible), so they fail the ICP test unless they custody real value. Only worth a touch if they raised
> big or hold user funds.

---

## Handling the "Hold" buckets

- **Hold — Disqual (129, M&A/IPO/public sale):** do **not** cold-pitch services. A just-acquired company's
  budget belongs to the acquirer; a company mid-IPO/public-sale is in a liquidity event, not a build phase.
  *Optional later play:* monitor for the acquirer's integration needs, or treat as relationship/nurture only.
- **Hold — No email (35):** route to **multichannel** — LinkedIn connect + X/Telegram DM (many have
  `linkedin`/`twitter` populated). For crypto founders these channels often out-perform email anyway. See the
  DM scripts in [04-sequences-and-copy.md](04-sequences-and-copy.md).

---

## Expected outcomes (calibrate before launch)

Using 2026 benchmarks against a tightly-segmented, triggered, founder-signed campaign:

- **Reply rate:** segmented/triggered cold realistically lands **5–12%** (vs. ~3.4% blended average). P1's
  personalization + funding trigger + founder pedigree should reach the top of that band.
- **Positive-reply rate:** ~3–5% is a strong result.
- **Meetings booked:** **1–4% of contacts touched** is a solid-to-excellent meeting rate; ~70% of meetings
  come from touch #3 or later — so the follow-up discipline in the playbook is where most meetings are won.

**Rough math (illustrative, not a promise):** 414 sendable × ~8% reply ≈ ~33 replies; at a ~3% meeting rate
≈ **~12 meetings** from the email channel — before any multichannel or warm-intro lift. Personalizing P1 and
running the full 4-touch sequence is what moves these numbers.

> Next: [03-cold-email-playbook.md](03-cold-email-playbook.md) for the rules, and
> [04-sequences-and-copy.md](04-sequences-and-copy.md) for the actual emails.
