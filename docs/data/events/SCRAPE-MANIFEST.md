# Event Speakers & Sponsors — Scrape Manifest

Scraped **2026-06-23** from each event's official website by a 31-agent team (one per event).
Files: `speakers/<slug>-speakers.csv`, `sponsors/<slug>-sponsors.csv`. Counts = data rows (header excluded).
`0` = lineup not published at scrape time (future event); file written with header only. No fabricated entries.
Year note flags events where the current (2026) lineup wasn't published and a prior edition was captured as fallback (tagged in-file).

| Event | Slug | Speakers | Sponsors | Year |
|---|---|---:|---:|---|
| Blockchain Futurist Conference Toronto | `blockchain-futurist-toronto` | 156 | 61 | 2026 (assumed) |
| Mining Disrupt 2026 | `mining-disrupt` | 113 | 122 | 2026 (assumed) |
| ETHGlobal Lisbon 2026 | `ethglobal-lisbon` | 12 | 9 | 2026 (assumed) |
| Pragma Lisbon 2026 | `pragma-lisbon` | 0 | 0 | not yet announced |
| Rare Evo 2026 | `rare-evo` | 70 | 129 | 2026 (assumed) |
| Coinfest Asia 2026 | `coinfest-asia` | 53 | 9 | 2026 |
| Wyoming Blockchain Symposium 2026 | `wyoming-blockchain-symposium` | 0 | 4 | 2026 (assumed) |
| Bitcoin Asia 2026 | `bitcoin-asia` | 71 | 39 | 2026 (assumed) |
| Bitcoin Policy Summit 2026 | `bitcoin-policy-summit` | 65 | 60 | incl. 2025 fallback |
| ETHOnline 2026 | `ethonline` | 0 | 5 | 2026 (assumed) |
| ETHGlobal Tokyo 2026 | `ethglobal-tokyo` | 0 | 4 | 2026 (assumed) |
| Pragma Tokyo 2026 | `pragma-tokyo` | 0 | 0 | not yet announced |
| BTCHel 2026 | `btchel` | 27 | 11 | 2026 (assumed) |
| Bitcoin++ Berlin 2026 | `bitcoin-plusplus-berlin` | 5 | 8 | 2026 (assumed) |
| Korea Blockchain Week 2026 | `korea-blockchain-week` | 12 | 172 | incl. 2025/2026 fallback |
| TOKEN2049 Singapore 2026 | `token2049-singapore` | 49 | 241 | 2026 |
| PlanB Forum Lugano 2026 | `planb-forum-lugano` | 62 | 3 | 2026 |
| Ripple Swell + Apex 2026 | `ripple-swell-apex` | 6 | 33 | incl. 2025/2026 fallback |
| Devcon 8 | `devcon-8` | 0 | 0 | not yet announced |
| Pragma Mumbai 2026 | `pragma-mumbai` | 0 | 0 | not yet announced |
| ETHGlobal Mumbai 2026 | `ethglobal-mumbai` | 0 | 5 | 2026 (assumed) |
| Web Summit Lisbon 2026 | `web-summit-lisbon` | 20 | 50 | incl. 2025 fallback |
| Bitcoin Amsterdam 2026 | `bitcoin-amsterdam` | 158 | 26 | 2026 (assumed) |
| Blockchain Futurist Conference Florida | `blockchain-futurist-florida` | 225 | 68 | 2026 (assumed) |
| Solana Breakpoint 2026 | `solana-breakpoint` | 0 | 13 | 2026 (assumed) |
| SiGMA World Rome 2026 | `sigma-world-rome` | 379 | 77 | 2026 (assumed) |
| SatsConf 2026 | `satsconf` | 27 | 0 | incl. 2025 fallback |
| Blockchain Life Forum 2026 | `blockchain-life-forum` | 52 | 121 | 2026 |
| Binance Blockchain Week 2026 | `binance-blockchain-week` | 25 | 14 | incl. 2025 fallback |
| Bitcoin MENA 2026 | `bitcoin-mena` | 188 | 69 | incl. 2025 fallback |
| Africa Bitcoin Conference 2026 | `africa-bitcoin-conference` | 14 | 0 | 2026 |
| **TOTAL (31 events)** | | **1789** | **1353** | |

## Aggregates (deduped master lists)

- `all-speakers.csv` — **1,674 unique speakers** (from 1,789 rows; 115 dupes merged). Deduped on normalized name + company. 90 appear at >1 event.
- `all-sponsors.csv` — **1,235 unique sponsors** (from 1,353 rows; 118 dupes merged). Deduped on registrable website domain (falls back to normalized name). 81 appear at >1 event.

Both carry `source_events`, `source_years`, `source_count` and a lossless union of every per-event column. Dedup is conservative (exact normalized key) — it avoids false merges, so a few real duplicates with differing company/name labels may remain separate.
