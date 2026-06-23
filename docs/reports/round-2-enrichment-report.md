# Round-2 Outreach List — Contact Enrichment Report

**Date:** 2026-06-23
**Source:** `docs/data/round-2/FP_Block_Outreach_List.numbers` (578 companies)
**Output:** `docs/data/round-2/FP_Block_Outreach_List_enriched.csv` (original 13 columns + 11 enrichment columns)
**Method:** Apollo `/v1/people/match` anchored on name + company domain + LinkedIn URL (no personal-email reveal, no phone — phone requires the unimplemented webhook).

---

## Headline finding

The sheet's emails were mostly **guessed** — 468 of 534 carried an `(inferred)` tag (pattern-built like `first.last@domain`, never verified).

Of the **302 inferred guesses Apollo could independently verify, 222 (≈73%) were wrong** — different local-part (`ray.yang@…` vs verified `ray@…`), or an entirely different domain because the person actually works elsewhere. Sending to those would have bounced or hit the wrong inbox. They are now replaced with Apollo-verified addresses.

---

## What changed (555 people with a named contact)

### Email — every one of the 555 lands in exactly one bucket

| Outcome | Count | Meaning |
|---|---:|---|
| **Verified, on company domain** | **221** | Apollo-verified work email at the company's own domain. Slam dunk — send. |
| **Verified, off-domain but LinkedIn-anchored** | **123** | Verified email for the *right person* (matched on their LinkedIn), but at a different domain — they likely changed jobs. Real, but confirm you still want them at the new company. |
| Verified, off-domain, name-only | 2 | Verified format, no LinkedIn anchor — glance before sending. |
| Apollo email but unverified | 5 | Apollo has an address but couldn't verify deliverability. |
| No Apollo match | 188 | Apollo had no record; the sheet's **inferred (unverified)** email stands. |
| Still no email anywhere | 16 | No email from any source. |

**344 verified emails total** (221 + 123). Cross-cut another way: of the inferred guesses, **94 were confirmed correct** and **247 were corrected** to a different verified address.

### Other channels
| Channel | Result |
|---|---|
| **LinkedIn** | +10 net-new · 447 confirmed · 11 where Apollo has a *different* URL on file (review) · 87 still none |
| **Twitter / X** | **+21 net-new handles** (the sheet had no Twitter column at all) |
| **Phone** | Not pursued — Apollo only returns phone numbers via an async webhook that isn't wired up in this project. |

### Bonus: companies that had no contact at all
23 rows listed a company but no person. Apollo people-search (founder / C-suite) found a decision-maker for **6**, with **5 emails** — e.g. `samed@tori.finance` (Tori Finance, founder), `fraser@algebralabs.ai` (Nolan). A couple need a sanity check (e.g. "Bluff" matched a plantation resort on `bluff.com`, not the crypto project). The remaining 17 are too small/new for Apollo to have data.

---

## How to use the enriched CSV

Two columns make it directly actionable:

- **`Best Email`** — the single recommended address per person (Apollo-verified when available, else the sheet's value).
- **`Best Email Trust`** — how much to trust it:
  - `verified` → send (344 rows)
  - `verified_review_org` / `org_search_review` → verified but at a different company; confirm the person hasn't moved
  - `inferred_unverified` → Apollo couldn't confirm; the sheet's guess is unproven (166 rows)
  - `sheet_unverified` → sheet had a non-inferred email kept as-is
  - `none` → no email (16 rows)

Supporting columns: `Apollo Email` / `Apollo Email Status`, `Email Result` (new / corrected / confirmed / corrected_offdomain / no_apollo_match / still_missing), `Apollo LinkedIn` + `LinkedIn Result`, `Apollo Twitter`, `Apollo Title`, `Match Confidence` (`high(li)` = LinkedIn-anchored, `med(name)` = name+domain only), and `Org Mismatch Flag`.

### Two things worth a human pass
1. **Off-domain emails (125 rows, flagged in `Org Mismatch Flag`).** These are real verified emails for the right person (mostly LinkedIn-anchored) but at a *different* domain than the company you listed — meaning the person likely changed jobs. Examples: Jim Hormuzdiar listed under "Strato" → verified `jim@blockapps.net`; Michael Hubbard under "Houdini Swap" → `michael@solstrategies.io`. Decide whether you're still targeting them at the new company.
2. **Name-only matches (93 rows, `Match Confidence = med(name)`).** No LinkedIn was available to anchor, so the match rests on name + company domain. High-trust when the email lands on-domain; verify the off-domain ones.

---

## Reproducing / extending

- `scripts/_round2_enrich.ts` — main pipeline. Resumable (caches raw Apollo responses); re-running re-classifies for free without new API calls. Flags: `--limit N`, `--concurrency N`.
- `scripts/_round2_nameless.ts` — people-search for companies with no listed contact.

Run cost this pass: **540 Apollo match credits + ~21 search credits**, 0 API errors.
