#!/usr/bin/env python3
"""
Combine round-1 enriched list + round-2 net-new (Apollo-enriched), dedupe, re-tier the full set.
Writes a combined master + refreshed sends/ tiers, each row tagged with `source` (round1 | round2_new).
Run from repo root: python3 docs/data/round-2/strategy/scripts/combine_and_segment.py
"""
import csv, re, os
from collections import Counter, defaultdict

R1 = "docs/data/round-2/lists/FP_Block_Outreach_List_enriched.csv"
R2 = "docs/data/round-2/lists/web3_fundraising_2025_2026_netnew.csv"
OUT = "docs/data/round-2/strategy/sends"
COMBINED = "docs/data/round-2/lists/FP_Block_MASTER_combined.csv"
os.makedirs(OUT, exist_ok=True)

def norm(s): return re.sub(r'[^a-z0-9]', '', (s or '').lower().strip())

# ---- scoring (mirrors segment.py) ----
TIER3 = {'DeFi','Derivatives','Trading','Perpetuals','Perps','Stablecoin','Payment','Payments','Real-World Assets','RWA',
 'Lending/Borrowing','Lending','Asset Management','Yield Aggregator','CEX','DEX','Custody','Bridge','Interoperability',
 'Prediction Markets','Staking','Restaking','Finance/Banking','Insurance','Options','Yield','Tokenization','Synthetics','Money Market'}
TIER2 = {'Infrastructure','L1','L2','Layer 1','Layer 2','Multichain','Oracle','DePIN','Identity','Data Service','Data',
 'Wallet','Node','Validator','Rollup','Modular','Account Abstraction','MPC','Cross-chain','API','Security'}
TIER1 = {'AI','Analytics','DApp','Developer Tools','Privacy','ZK','Compute'}
SEG_ORDER = [
 ('Trading & DeFi', {'Derivatives','Trading','Perpetuals','Perps','DEX','Lending/Borrowing','Lending','Yield Aggregator','Asset Management','Prediction Markets','Options','Synthetics','Money Market','DeFi'}),
 ('Payments & Stablecoins', {'Stablecoin','Payment','Payments','Finance/Banking','CEX'}),
 ('RWA & Tokenization', {'Real-World Assets','RWA','Tokenization','Insurance'}),
 ('Infra & Chains', {'Infrastructure','L1','L2','Layer 1','Layer 2','Multichain','Oracle','DePIN','Interoperability','Bridge','Wallet','Custody','Staking','Restaking','Node','Validator','Rollup','Modular','Data Service','Data','Identity','MPC','Security','API'}),
 ('AI x Crypto', {'AI','Analytics','Compute'}),
 ('Consumer/Gaming/Social', {'Gaming','NFT','Social Network','Social/Community','P2E','Meme','Content','DApp'}),
]
DISQUAL = {'M&A','IPO','Public sale','Public Listing & Financing','Public Offering','Private Placement','Grants'}

def cats(s): return [c.strip() for c in re.split(r'[;,]', s or '') if c.strip()]
def cscore(cs):
    cs=set(cs)
    return 3 if cs&TIER3 else 2 if cs&TIER2 else 1 if cs&TIER1 else 0
def segment(cs):
    cs=set(cs)
    for n,k in SEG_ORDER:
        if cs&k: return n
    return 'Other'
def amt_m(s):
    if not s: return None
    m=re.search(r'\$?([\d.]+)\s*([MBK]?)', s.replace(',',''))
    if not m: return None
    v=float(m.group(1)); u=m.group(2)
    return v*1000 if u=='B' else v if u=='M' else v/1000 if u=='K' else v
def verified(trust):
    return (trust or '').strip().lower() in {'verified'}

# ---- load both, unify ----
def load(path, source):
    rows=[]
    for r in csv.DictReader(open(path)):
        rows.append({
            'company': r.get('Company Name','').strip(),
            'contact_name': r.get('CEO/CTO Name','').strip(),
            'contact_title': r.get('Title','').strip() or r.get('Apollo Title','').strip(),
            'email': r.get('Best Email','').strip(),
            'email_trust': r.get('Best Email Trust','').strip(),
            'round_type': r.get('Round Type','').strip(),
            'round_date': r.get('Round Date','').strip(),
            'amount_raised': r.get('Amount Raised','').strip(),
            'categories': r.get('Categories','').strip(),
            'website': r.get('Website','').strip(),
            'company_summary': r.get('Company Summary','').strip(),
            'linkedin': (r.get('Personal LinkedIn') or r.get('Apollo LinkedIn') or '').strip(),
            'twitter': r.get('Apollo Twitter','').strip(),
            'investors': r.get('Investors','').strip(),
            'org_flag': r.get('Org Mismatch Flag','').strip(),
            'source': source,
        })
    return rows

r1=load(R1,'round1'); r2=load(R2,'round2_new')
print(f"round1: {len(r1)} | round2 net-new: {len(r2)}")

# dedupe (round1 wins on collision)
seen={norm(x['company']) for x in r1}
r2_clean=[x for x in r2 if norm(x['company']) not in seen]
print(f"round2 after dedupe vs round1: {len(r2_clean)}")
rows=r1+r2_clean

# ---- tier ----
for r in rows:
    cs=cats(r['categories']); sc=cscore(cs); a=amt_m(r['amount_raised'])
    r['_seg']=segment(cs); r['_cscore']=sc; r['_amt']=a
    big=(a is not None and a>=5); qual=r['round_type'] not in DISQUAL
    has_email=bool(r['email']); ver=verified(r['email_trust']); named=bool(r['contact_name'])
    eq=2 if ver else 1 if has_email else 0
    r['_composite']=sc*2 + (2 if (a and a>=20) else 1 if (a and a>=5) else 0) + eq + (1 if named else 0)
    # uncertain org identity from round-2 org-search (AMBIGUOUS / low-match) -> human review before send.
    # Scoped to round2_new only; round-1's milder Org Mismatch Flag was already vetted in the original tiering.
    flagged = bool(r['org_flag']) and r['source']=='round2_new'
    if not has_email: r['_tier']='Hold-NoEmail'
    elif not qual: r['_tier']='Hold-Disqual'
    elif flagged: r['_tier']='Hold-Review'      # has email but org match is uncertain — verify domain first
    elif sc==3 and ver and named and big: r['_tier']='P1-Priority'
    elif sc>=2 and ver and named: r['_tier']='P2-Strong'
    elif sc>=1 and has_email: r['_tier']='P3-Broad'
    else: r['_tier']='P4-Low'

# ---- report ----
print("\n=== COMBINED TIER DISTRIBUTION (round2 net-new contribution) ===")
by_tier=Counter(r['_tier'] for r in rows)
by_tier_new=Counter(r['_tier'] for r in rows if r['source']=='round2_new')
for t in ['P1-Priority','P2-Strong','P3-Broad','P4-Low','Hold-Review','Hold-Disqual','Hold-NoEmail']:
    print(f"  {by_tier[t]:4}  {t:14} (+{by_tier_new[t]} new)")
print(f"\nTOTAL companies: {len(rows)}  | round2 net-new added: {len(r2_clean)}")
print(f"net-new with email: {sum(1 for r in r2_clean if r['email'])} | verified: {sum(1 for r in r2_clean if verified(r['email_trust']))}")

# ---- write combined master + tiers ----
FIELDS=['company','contact_name','contact_title','email','email_trust','round_type','round_date',
 'amount_raised','categories','website','company_summary','linkedin','twitter','investors',
 'segment','tier','priority_score','source','org_flag']
def emit(path, subset):
    subset=sorted(subset, key=lambda r:-r['_composite'])
    with open(path,'w',newline='') as f:
        w=csv.writer(f); w.writerow(FIELDS)
        for r in subset:
            w.writerow([r['company'],r['contact_name'],r['contact_title'],r['email'],r['email_trust'],
                r['round_type'],r['round_date'],r['amount_raised'],r['categories'],r['website'],
                r['company_summary'],r['linkedin'],r['twitter'],r['investors'],r['_seg'],r['_tier'],
                r['_composite'],r['source'],r['org_flag']])

emit(COMBINED, rows)
print(f"\nwrote {COMBINED} ({len(rows)})")
for t in ['P1-Priority','P2-Strong','P3-Broad','P4-Low','Hold-Review','Hold-Disqual','Hold-NoEmail']:
    fn=f"{OUT}/{t.lower().replace('-','_')}.csv"
    emit(fn,[r for r in rows if r['_tier']==t])
# round2-only additions (so you can send to just the new ones)
emit(f"{OUT}/round2_additions.csv",[r for r in r2_clean if r['_tier'] in ('P1-Priority','P2-Strong','P3-Broad')])
print(f"wrote {OUT}/round2_additions.csv (sendable net-new only)")
print("DONE")
