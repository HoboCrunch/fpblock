#!/usr/bin/env python3
"""Clean the organization field in ethcc9_speakers.csv, splitting into organization + role."""

import csv
import re

INPUT = "ethcc9_speakers.csv"
OUTPUT = "ethcc9_speakers_cleaned.csv"

# Manual org → (cleaned_org, role) mappings for entries that need special handling
MANUAL_MAPPINGS = {
    "Angel Investor & Advisor at Large": ("Independent", "Angel Investor & Advisor"),
    "Leadership Coaching | Zuza Zuber": ("Independent", "Leadership Coach"),
    "DAO Leadership  ": ("DAO Leadership", ""),
    "Oasis Network - Founding Engineer": ("Oasis Network", "Founding Engineer"),
    "Imperial College London / Flashbots": ("Imperial College London / Flashbots", "Researcher"),
    "Goldsky (and also erpc open-source)": ("Goldsky", ""),
    "Protocol labs Filecoin Impact Fund (PLFIF) ": ("Protocol Labs (Filecoin Impact Fund)", ""),
    "https://github.com/ReamLabs/ream": ("Ream Labs", ""),
    "Independent ": ("Independent", ""),
    "Independent researcher": ("Independent", "Researcher"),
    "independant": ("Independent", ""),
    "researcher": ("Independent", "Researcher"),
    "None": ("", ""),
    "Own": ("Independent", ""),
}

# Org name normalization (typos, abbreviations, casing)
ORG_NORMALIZE = {
    "Ethereum Foun": "Ethereum Foundation",
    "Société Général-Forge": "Société Générale-Forge",
    "SG Forge": "Société Générale-Forge",
    "ConsenSys": "Consensys",
    "0xbow.io": "0xbow",
    "Wonderland ": "Wonderland",
    "ZKNOX": "ZKNox",
    "zknox": "ZKNox",
    "Flashbots X": "Flashbots",
    "offchain labs": "Offchain Labs",
    "Certota": "Certora",
    "Flight3 ": "Flight3",
    "Paxos Labs ": "Paxos Labs",
    "SKALE Labs ": "SKALE Labs",
    "xStocks ": "xStocks",
    "Blockchain for Good": "Blockchain For Good",
    "Kleros Cooperative": "Kleros",
    "Safe Research": "Safe",
    "Safe Labs": "Safe",
    "Token Engineering Labs GmbH": "Token Engineering Labs",
    "Starknet foundation": "Starknet Foundation",
    "BELEM CAPITAL AND ROCKAWAYX": "Belem Capital / RockawayX",
    "Opsek / SEAL": "Opsek / SEAL",
    "IPTF at Ethereum Foundation": "Ethereum Foundation",
    "Covalenthq.com": "Covalent",
    "ambire.com / goodmorning.dev": "Ambire",
    "corpus.core GmbH / colibri.stateless": "corpus.core GmbH / colibri.stateless",
    "Kleros; Seer": "Kleros / Seer",
    "Nomad Capital; Buidlpad": "Nomad Capital / Buidlpad",
    "TheDAO & Giveth": "TheDAO / Giveth",
    "TheDAO Security Fund, Giveth": "TheDAO / Giveth",
    "Matter Labs (zkSync)": "Matter Labs (zkSync)",
    "Monad Foundation": "Monad",
    "Compound Foundation": "Compound",
    "Celo Foundation": "Celo",
    "blocksight.dev & AMGI Studios": "Blocksight / AMGI Studios",
    "PENNY by B2C2": "B2C2 (PENNY)",
}


def clean_org(raw_org):
    """Return (cleaned_org, role) tuple."""
    raw_org = raw_org.strip()

    # Check manual mappings first
    if raw_org in MANUAL_MAPPINGS:
        return MANUAL_MAPPINGS[raw_org]

    # Check normalization
    org = ORG_NORMALIZE.get(raw_org, raw_org)

    return (org, "")


def main():
    with open(INPUT, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames)
        rows = list(reader)

    # Insert 'role' column right after 'organization'
    org_idx = fieldnames.index("organization")
    new_fieldnames = fieldnames[:org_idx + 1] + ["role"] + fieldnames[org_idx + 1:]

    cleaned_rows = []
    for row in rows:
        org, role = clean_org(row["organization"])
        row["organization"] = org
        row["role"] = role
        cleaned_rows.append(row)

    with open(OUTPUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=new_fieldnames)
        writer.writeheader()
        writer.writerows(cleaned_rows)

    print(f"Wrote {len(cleaned_rows)} rows to {OUTPUT}")
    print(f"Columns: {new_fieldnames}")

    # Show what changed
    changes = [(r["displayName"], clean_org(raw), r["organization"])
                for r, raw in zip(cleaned_rows, [row["organization"] for row in rows])]
    # Re-read original for comparison
    with open(INPUT, newline="", encoding="utf-8") as f:
        orig_rows = list(csv.DictReader(f))

    print("\n--- Changes ---")
    for orig, cleaned in zip(orig_rows, cleaned_rows):
        if orig["organization"].strip() != cleaned["organization"] or cleaned["role"]:
            print(f"  {cleaned['displayName']}: '{orig['organization']}' → org='{cleaned['organization']}', role='{cleaned['role']}'")


if __name__ == "__main__":
    main()
