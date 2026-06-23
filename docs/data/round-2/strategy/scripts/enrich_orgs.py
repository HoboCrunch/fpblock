#!/usr/bin/env python3
"""
Org-based Apollo enrichment for net-new companies (no known contact).
Pipeline per company:
  1. mixed_companies/search  -> resolve org (domain, id, linkedin)
  2. mixed_people/search     -> find a leader (Founder/CEO/CTO) at that org
  3. people/match (reveal)   -> get that person's email
Caches everything. Usage:
  python3 enrich_orgs.py --limit 5 --test     # validate on first 5 targets, no file write
  python3 enrich_orgs.py                       # full run over all _enrich_target=1 rows
"""
import csv, json, os, re, time, sys, argparse
from pathlib import Path
import requests
from dotenv import load_dotenv

load_dotenv(".env.local")
KEY = os.getenv("APOLLO_API_KEY")
NETNEW = "docs/data/round-2/lists/web3_fundraising_2025_2026_netnew.csv"
CACHE = "/private/tmp/claude-501/-Users-evansteinhilv-genzio-Cannes/42f988e9-3410-4bcc-9ac2-2031167d04f1/scratchpad/apollo_org_cache.json"
DELAY = 0.6
H = {"X-Api-Key": KEY, "Content-Type": "application/json"}
TITLES = ["founder","co-founder","cofounder","ceo","chief executive officer","cto","chief technology officer"]
SEN = ["founder","c_suite","owner"]

def norm(s): return re.sub(r'[^a-z0-9]','',(s or '').lower())
def load(): return json.load(open(CACHE)) if Path(CACHE).exists() else {}
def save(c): json.dump(c, open(CACHE,'w'), indent=1)

def org_search(name):
    try:
        r = requests.post("https://api.apollo.io/api/v1/mixed_companies/search",
                          headers=H, json={"q_organization_name": name, "per_page": 10}, timeout=20)
        r.raise_for_status(); orgs = r.json().get("organizations") or r.json().get("accounts") or []
    except Exception as e:
        print(f"    org_search err: {e}"); return None
    if not orgs: return None
    qn = norm(name)
    def score(o):
        on = norm(o.get("name",""))
        s = 0
        if on == qn: s += 100
        elif qn and (qn in on or on in qn): s += 40
        if o.get("primary_domain"): s += 3
        return s
    best = max(orgs, key=score)
    # ambiguity: >1 org shares the exact normalized name -> can't disambiguate without a domain
    exact = sum(1 for o in orgs if norm(o.get("name",""))==qn)
    return {"id": best.get("id"), "name": best.get("name",""),
            "domain": best.get("primary_domain") or best.get("website_url") or "",
            "linkedin": best.get("linkedin_url") or "", "score": score(best),
            "ambiguous": exact>1}

def people_search(org_id):
    """New api_search endpoint: returns redacted people w/ id + first_name + title."""
    try:
        r = requests.post("https://api.apollo.io/api/v1/mixed_people/api_search", headers=H,
                          json={"organization_ids":[org_id], "person_titles":TITLES,
                                "person_seniorities":SEN, "per_page":10}, timeout=25)
        r.raise_for_status(); ppl = r.json().get("people") or []
    except Exception as e:
        print(f"    people_search err: {e}"); return None
    if not ppl: return None
    def rank(p):
        t=(p.get("title") or "").lower()
        return (("ceo" in t or "chief executive" in t)*5 + ("founder" in t)*4
                + ("cto" in t or "chief technology" in t)*3 + bool(p.get("has_email"))*1)
    return max(ppl, key=rank)

def reveal_by_id(pid):
    """people/match by Apollo person id + reveal -> full name, email, linkedin."""
    try:
        r=requests.post("https://api.apollo.io/api/v1/people/match", headers=H,
                        json={"id":pid,"reveal_personal_emails":True}, timeout=25)
        r.raise_for_status(); p=r.json().get("person")
    except Exception as e:
        print(f"    match err: {e}"); return {}
    if not p: return {}
    email=""
    for e in (p.get("email_addresses") or []):
        if e.get("type")=="work" and e.get("email"): email=e["email"]; break
    email = email or p.get("email") or ""
    if email and "email_not_unlocked" in email: email=""
    return {"name":p.get("name",""), "title":p.get("title",""), "email":email,
            "email_status":p.get("email_status",""), "linkedin":p.get("linkedin_url",""),
            "twitter":p.get("twitter_url","")}

def enrich(company, cache, verbose=False):
    if company in cache: return cache[company]
    res={"org_name":"","domain":"","contact":"","title":"","linkedin":"","twitter":"","email":"","email_status":"","mismatch":""}
    org=org_search(company); time.sleep(DELAY)
    if not org or not org.get("id"):
        cache[company]=res; return res
    res["org_name"]=org["name"]; res["domain"]=org["domain"]
    if org["score"] < 40:
        res["mismatch"]=f"low-match org='{org['name']}'"
    elif org.get("ambiguous"):
        res["mismatch"]=f"AMBIGUOUS (multiple orgs named '{company}') -> verify domain {org['domain']}"
    person=people_search(org["id"]); time.sleep(DELAY)
    if person and person.get("id"):
        m=reveal_by_id(person["id"]); time.sleep(DELAY)
        res["contact"]=m.get("name") or person.get("first_name","")
        res["title"]=m.get("title") or person.get("title","")
        res["linkedin"]=m.get("linkedin",""); res["twitter"]=m.get("twitter","")
        res["email"]=m.get("email",""); res["email_status"]=m.get("email_status","")
    if verbose:
        print(f"  {company:28} -> org='{res['org_name']}' dom={res['domain']}")
        print(f"      contact={res['contact']!r} ({res['title']}) email={res['email']!r} {('MISMATCH '+res['mismatch']) if res['mismatch'] else ''}")
    cache[company]=res; return res

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--limit",type=int,default=0); ap.add_argument("--test",action="store_true")
    a=ap.parse_args()
    if not KEY: raise SystemExit("APOLLO_API_KEY missing")
    rows=list(csv.DictReader(open(NETNEW)))
    targets=[r for r in rows if r["_enrich_target"]=="1"]
    if a.limit: targets=targets[:a.limit]
    print(f"enriching {len(targets)} companies{' [TEST]' if a.test else ''}")
    cache=load()
    hits=email_hits=0
    for i,r in enumerate(targets,1):
        if not a.test: print(f"[{i}/{len(targets)}] {r['Company Name']}")
        res=enrich(r["Company Name"], cache, verbose=a.test)
        if res["contact"]: hits+=1
        if res["email"]: email_hits+=1
        save(cache)
        # merge into row
        if not a.test:
            r["CEO/CTO Name"]=r["CEO/CTO Name"] or res["contact"]
            r["Title"]=r["Title"] or res["title"]
            r["Website"]=r["Website"] or res["domain"]
            r["Apollo LinkedIn"]=res["linkedin"]; r["Apollo Twitter"]=res["twitter"]
            r["Apollo Title"]=res["title"]; r["Org Mismatch Flag"]=res["mismatch"]
            if res["email"]:
                r["Best Email"]=res["email"]; r["Apollo Email"]=res["email"]
                r["Best Email Trust"]=res["email_status"] or "apollo"
                r["Apollo Email Status"]=res["email_status"]; r["Email Result"]="new"
    print(f"\ncontact hits: {hits}/{len(targets)}  | email hits: {email_hits}/{len(targets)}")
    if not a.test:
        with open(NETNEW,'w',newline='') as f:
            w=csv.DictWriter(f, fieldnames=rows[0].keys()); w.writeheader(); w.writerows(rows)
        print(f"wrote {NETNEW}")

if __name__=="__main__": main()
