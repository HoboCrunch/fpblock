#!/usr/bin/env python3
"""Dedupe new fundraising CSV vs master, map net-new to master schema, flag enrichment targets."""
import csv, re
from collections import Counter

OLD = "docs/data/round-2/lists/FP_Block_Outreach_List_enriched.csv"
NEW = "docs/data/round-2/lists/web3_fundraising_2025_2026.csv"
OUT = "docs/data/round-2/lists/web3_fundraising_2025_2026_netnew.csv"

def norm(s):
    return re.sub(r'[^a-z0-9]', '', (s or '').lower().strip())

old = list(csv.DictReader(open(OLD)))
new = list(csv.DictReader(open(NEW)))
old_names = {norm(r['Company Name']) for r in old}

netnew = [r for r in new if norm(r['Company']) not in old_names]
print(f"net-new: {len(netnew)} (of {len(new)})")

# ---- ICP scoring (mirror of scripts/segment.py) ----
TIER3 = {'DeFi','Derivatives','Trading','Perpetuals','Perps','Stablecoin','Payment','Payments','Real-World Assets','RWA',
 'Lending/Borrowing','Lending','Asset Management','Yield Aggregator','CEX','DEX','Custody','Bridge','Interoperability',
 'Prediction Markets','Staking','Restaking','Finance/Banking','Insurance','Options','Yield','Tokenization','Synthetics','Money Market'}
TIER2 = {'Infrastructure','L1','L2','Layer 1','Layer 2','Multichain','Oracle','DePIN','Identity','Data Service','Data',
 'Wallet','Node','Validator','Rollup','Modular','Account Abstraction','MPC','Cross-chain','API','Security'}
TIER1 = {'AI','Analytics','DApp','Developer Tools','Privacy','ZK','Compute'}

def cats(s): return [c.strip() for c in re.split(r'[;,]', s or '') if c.strip()]
def cscore(cs):
    cs=set(cs)
    if cs & TIER3: return 3
    if cs & TIER2: return 2
    if cs & TIER1: return 1
    return 0

SEG_ORDER = [
 ('Trading & DeFi', {'Derivatives','Trading','Perpetuals','Perps','DEX','Lending/Borrowing','Lending','Yield Aggregator','Asset Management','Prediction Markets','Options','Synthetics','Money Market','DeFi'}),
 ('Payments & Stablecoins', {'Stablecoin','Payment','Payments','Finance/Banking','CEX'}),
 ('RWA & Tokenization', {'Real-World Assets','RWA','Tokenization','Insurance'}),
 ('Infra & Chains', {'Infrastructure','L1','L2','Layer 1','Layer 2','Multichain','Oracle','DePIN','Interoperability','Bridge','Wallet','Custody','Staking','Restaking','Node','Validator','Rollup','Modular','Data Service','Data','Identity','MPC','Security','API'}),
 ('AI x Crypto', {'AI','Analytics','Compute'}),
 ('Consumer/Gaming/Social', {'Gaming','NFT','Social Network','Social/Community','P2E','Meme','Content','DApp'}),
]
def segment(cs):
    cs=set(cs)
    for n,k in SEG_ORDER:
        if cs & k: return n
    return 'Other'

DISQUAL = {'Public sale','IPO','M&A','Public Offering','Public Listing & Financing','Private Placement'}

def usd_m(r):
    s=(r.get('Amount Raised (USD)') or '').strip()
    try: return float(s)/1e6
    except: return None

# ---- master schema ----
MASTER = ['Company Name','CEO/CTO Name','Title','Personal LinkedIn','Personal Email','Round Type','Round Date',
 'Amount Raised','Categories','Investors','Website','Company Summary','FP Block Outreach Angle','Best Email',
 'Best Email Trust','Apollo Email','Apollo Email Status','Email Result','Apollo LinkedIn','LinkedIn Result',
 'Apollo Twitter','Apollo Title','Match Confidence','Org Mismatch Flag','Source URL','Amount Raised (USD)',
 '_seg','_cscore','_enrich_target']

targets=0
seg_ct=Counter()
out=[]
for r in netnew:
    cs=cats(r.get('Category',''))
    sc=cscore(cs); seg=segment(cs)
    rd=(r.get('Round Type') or '').strip()
    a=usd_m(r)
    # enrichment target: real ICP fit, not a disqualifying liquidity event, and has signal (amount OR a known round)
    is_target = (sc>=2) and (rd not in DISQUAL) and (a is not None or (rd and rd!='Unknown'))
    if is_target: targets+=1; seg_ct[seg]+=1
    out.append({
        'Company Name': r['Company'], 'CEO/CTO Name': r.get('CEO') or r.get('CTO') or '',
        'Title': 'CEO' if r.get('CEO') else ('CTO' if r.get('CTO') else ''),
        'Personal LinkedIn':'', 'Personal Email':'',
        'Round Type': rd, 'Round Date': (r.get('Date Raised') or '').strip(),
        'Amount Raised': (r.get('Amount Raised') or '').strip(), 'Categories': (r.get('Category') or '').strip(),
        'Investors': (r.get('Investors') or '').strip(), 'Website': (r.get('Website') or '').strip(),
        'Company Summary': (r.get('Description') or '').strip(), 'FP Block Outreach Angle':'',
        'Best Email':'','Best Email Trust':'','Apollo Email':'','Apollo Email Status':'','Email Result':'',
        'Apollo LinkedIn':'','LinkedIn Result':'','Apollo Twitter':'','Apollo Title':'',
        'Match Confidence':'','Org Mismatch Flag':'',
        'Source URL': (r.get('Source URL') or '').strip(), 'Amount Raised (USD)': (r.get('Amount Raised (USD)') or '').strip(),
        '_seg': seg, '_cscore': sc, '_enrich_target': '1' if is_target else '0',
    })

with open(OUT,'w',newline='') as f:
    w=csv.DictWriter(f, fieldnames=MASTER); w.writeheader(); w.writerows(out)
print(f"wrote {OUT}")
print(f"\nENRICHMENT TARGETS (ICP>=2, not disqual, has signal): {targets}")
print("  by segment:")
for k,v in seg_ct.most_common(): print(f"    {v:4}  {k}")
print(f"\nNON-targets skipped: {len(netnew)-targets}  (low ICP / public-sale / IPO / unknown-no-amount)")
