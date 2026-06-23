#!/usr/bin/env python3
"""Segment & tier the FP Block round-2 outreach list."""
import csv, re, os
from collections import Counter, defaultdict

SRC = "docs/data/round-2/lists/FP_Block_Outreach_List_enriched.csv"
OUT = "docs/data/round-2/strategy/sends"
os.makedirs(OUT, exist_ok=True)

rows = list(csv.DictReader(open(SRC)))

# ---- helpers -------------------------------------------------------------
def amt_m(s):
    if not s: return None
    m = re.search(r'\$?([\d.]+)\s*([MBK]?)', s.replace(',', ''))
    if not m: return None
    v = float(m.group(1)); u = m.group(2)
    return v*1000 if u == 'B' else v if u == 'M' else v/1000 if u == 'K' else (v if v > 100 else v)  # bare number -> assume $M

def cats(r):
    return [c.strip() for c in re.split(r'[;,]', r.get('Categories','') or '') if c.strip()]

# ICP category buckets (FP Block = high-stakes, irreversible, value-at-risk systems)
TIER3_CAT = {  # money-on-the-line / irreversible -> score 3
 'DeFi','Derivatives','Trading','Perpetuals','Perps','Stablecoin','Payment','Real-World Assets','RWA',
 'Lending/Borrowing','Asset Management','Yield Aggregator','CEX','DEX','Custody','Bridge','Interoperability',
 'Prediction Markets','Staking','Restaking','Finance/Banking','Insurance','Options','Yield','Tokenization',
 'Liquid Staking','Money Market','Synthetics'}
TIER2_CAT = {  # systems others depend on -> score 2
 'Infrastructure','L1','L2','Layer 1','Layer 2','Multichain','Oracle','DePIN','Identity','Data Service',
 'Wallet','Node','Validator','Rollup','Modular','Account Abstraction','MPC','Cross-chain','API'}
TIER1_CAT = {  # depends -> score 1
 'AI','Analytics','DApp','Developer Tools','Privacy','ZK','Compute'}
# everything else (Gaming, NFT, Social Network, P2E, Meme, Consumer, Content) -> 0

def icp_cat_score(r):
    cs = cats(r)
    if any(c in TIER3_CAT for c in cs): return 3
    if any(c in TIER2_CAT for c in cs): return 2
    if any(c in TIER1_CAT for c in cs): return 1
    return 0

# Primary segment for messaging
SEG_ORDER = [
 ('Trading & DeFi',      {'Derivatives','Trading','Perpetuals','Perps','DEX','Lending/Borrowing','Yield Aggregator','Asset Management','Prediction Markets','Options','Synthetics','Money Market','DeFi'}),
 ('Payments & Stablecoins', {'Stablecoin','Payment','Finance/Banking','CEX'}),
 ('RWA & Tokenization',  {'Real-World Assets','RWA','Tokenization','Insurance'}),
 ('Infra & Chains',      {'Infrastructure','L1','L2','Layer 1','Layer 2','Multichain','Oracle','DePIN','Interoperability','Bridge','Wallet','Custody','Staking','Restaking','Node','Validator','Rollup','Modular','Data Service','Identity','MPC'}),
 ('AI x Crypto',         {'AI','Analytics','Compute'}),
 ('Consumer/Gaming/Social', {'Gaming','NFT','Social Network','P2E','Meme','Content','DApp'}),
]
def segment(r):
    cs = set(cats(r))
    for name, keys in SEG_ORDER:
        if cs & keys: return name
    return 'Other'

QUALIFYING_ROUNDS = {'Seed','Pre-seed','Pre-Seed','Series A','Series B','Series C','Series E','Series F',
 'Strategic','Strategic Investment','Angel','Seed Round','Seed Investment','Strategic Round','Strategic Financing',
 'Bridge loan towards Series A','Funding Round','Financing Round','Investment','Venture Funding','Additional Funding Round',''}
DISQUALIFYING_ROUNDS = {'M&A','IPO','Public sale','Public Listing & Financing','Public Offering','Private Placement','Public sale ','Grants'}

def email_ok(r):
    return bool((r.get('Best Email','') or '').strip())
def verified(r):
    return (r.get('Best Email Trust','') or '').strip() == 'verified'
def named(r):
    return bool((r.get('CEO/CTO Name','') or '').strip())

# ---- score + tier --------------------------------------------------------
for r in rows:
    cscore = icp_cat_score(r)
    a = amt_m(r.get('Amount Raised',''))
    fund = 2 if (a and a >= 20) else 1 if (a and a >= 5) else 0
    rd = (r.get('Round Type','') or '').strip()
    qual = rd not in DISQUALIFYING_ROUNDS
    eq = 2 if verified(r) else 1 if email_ok(r) else 0
    composite = cscore*2 + fund + eq + (1 if named(r) else 0)
    r['_cscore'] = cscore; r['_amt'] = a; r['_fund'] = fund
    r['_qual'] = qual; r['_eq'] = eq; r['_named'] = named(r)
    r['_seg'] = segment(r); r['_composite'] = composite
    r['_rd'] = rd

    big = (a is not None and a >= 5)
    if not email_ok(r):
        r['_tier'] = 'Hold-NoEmail'
    elif not qual:
        r['_tier'] = 'Hold-Disqual'        # M&A / IPO / public sale
    elif cscore == 3 and verified(r) and named(r) and big:
        r['_tier'] = 'P1-Priority'         # money-on-the-line, funded >=$5M, verified, named  -> hand-personalize
    elif cscore >= 2 and verified(r) and named(r):
        r['_tier'] = 'P2-Strong'           # high-ICP, verified, named (smaller/unknown raise) -> templated + light personalization
    elif cscore >= 1 and email_ok(r):
        r['_tier'] = 'P3-Broad'            # qualifying + email present (incl. UNVERIFIED -> verify before send)
    else:
        r['_tier'] = 'P4-Low'              # weak ICP fit

# ---- report --------------------------------------------------------------
print("=== TIER DISTRIBUTION ===")
for k,v in Counter(r['_tier'] for r in rows).most_common():
    print(f"  {v:4}  {k}")

print("\n=== SEGMENT x TIER (sendable tiers only) ===")
send_tiers = ['P1-Priority','P2-Strong','P3-Broad','P4-Low']
grid = defaultdict(Counter)
for r in rows:
    if r['_tier'] in send_tiers:
        grid[r['_seg']][r['_tier']] += 1
print(f"  {'Segment':<26}{'P1':>5}{'P2':>5}{'P3':>5}{'P4':>5}{'TOT':>6}")
for seg in [s[0] for s in SEG_ORDER] + ['Other']:
    c = grid.get(seg)
    if not c: continue
    tot = sum(c.values())
    print(f"  {seg:<26}{c['P1-Priority']:>5}{c['P2-Strong']:>5}{c['P3-Broad']:>5}{c['P4-Low']:>5}{tot:>6}")

print("\n=== SENDABLE EMAIL QUALITY ===")
send = [r for r in rows if r['_tier'] in send_tiers]
print(f"  total sendable: {len(send)}")
print(f"  verified email: {sum(verified(r) for r in send)}")
print(f"  unverified but present: {sum(email_ok(r) and not verified(r) for r in send)}")
print(f"  with named contact: {sum(r['_named'] for r in send)}")

# ---- write tiered send lists --------------------------------------------
KEEP = ['Company Name','CEO/CTO Name','Title','Best Email','Best Email Trust',
        'Round Type','Round Date','Amount Raised','Categories','Website','Company Summary',
        'Personal LinkedIn','Apollo LinkedIn','Apollo Twitter','_seg','_composite','_amt']
HEADER = ['company','contact_name','contact_title','email','email_trust','round_type','round_date',
          'amount_raised','categories','website','company_summary','linkedin','twitter','segment','priority_score','raise_usd_m']

def emit(fname, subset):
    subset = sorted(subset, key=lambda r: -r['_composite'])
    with open(f"{OUT}/{fname}", 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(HEADER)
        for r in subset:
            li = (r.get('Personal LinkedIn') or r.get('Apollo LinkedIn') or '').strip()
            w.writerow([r['Company Name'], r['CEO/CTO Name'], r['Title'], r['Best Email'],
                        r['Best Email Trust'], r['_rd'], r['Round Date'], r['Amount Raised'],
                        r['Categories'], r['Website'], r['Company Summary'], li,
                        (r.get('Apollo Twitter') or '').strip(), r['_seg'],
                        r['_composite'], r['_amt'] if r['_amt'] else ''])
    return len(subset)

for tier in send_tiers:
    n = emit(f"{tier.lower().replace('-','_')}.csv", [r for r in rows if r['_tier']==tier])
    print(f"  wrote {OUT}/{tier.lower().replace('-','_')}.csv  ({n})")
# hold lists
for hold in ['Hold-NoEmail','Hold-Disqual']:
    n = emit(f"{hold.lower().replace('-','_')}.csv", [r for r in rows if r['_tier']==hold])
    print(f"  wrote {OUT}/{hold.lower().replace('-','_')}.csv  ({n})")

print("\nDONE")
