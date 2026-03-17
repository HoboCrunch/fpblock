#!/usr/bin/env python3
"""Merge rewritten messages from batch JSON files back into enriched_speakers.csv"""

import csv
import json
import os
import shutil

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
CSV_PATH = os.path.join(DATA_DIR, 'enriched_speakers.csv')
BACKUP_PATH = os.path.join(DATA_DIR, 'enriched_speakers_backup.csv')
OUTPUT_PATH = os.path.join(DATA_DIR, 'enriched_speakers.csv')

BATCH_FILES = [
    os.path.join(DATA_DIR, f'messages_rewrite_batch{i}.json')
    for i in range(1, 5)
]

def main():
    # Backup original
    shutil.copy2(CSV_PATH, BACKUP_PATH)
    print(f"Backup saved to {BACKUP_PATH}")

    # Load all rewrites keyed by line number (1-indexed)
    rewrites = {}
    for bf in BATCH_FILES:
        if not os.path.exists(bf):
            print(f"WARNING: {bf} not found, skipping")
            continue
        with open(bf, 'r') as f:
            batch = json.load(f)
        for line_num, msg in batch.items():
            rewrites[int(line_num)] = msg
        print(f"Loaded {len(batch)} rewrites from {os.path.basename(bf)}")

    print(f"Total rewrites loaded: {len(rewrites)}")

    # Read CSV lines (preserving exact format)
    with open(CSV_PATH, 'r', newline='') as f:
        reader = csv.reader(f)
        rows = list(reader)

    # Apply rewrites (line 1 = header = rows[0], line 2 = rows[1], etc.)
    applied = 0
    for line_num, new_msg in rewrites.items():
        row_idx = line_num - 1  # line 2 -> index 1
        if row_idx < len(rows):
            rows[row_idx][7] = new_msg  # Column 8 (0-indexed: 7) is Message
            applied += 1

    print(f"Applied {applied} rewrites")

    # Write back
    with open(OUTPUT_PATH, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerows(rows)

    print(f"Updated CSV written to {OUTPUT_PATH}")

    # Verify
    with open(OUTPUT_PATH, 'r') as f:
        reader = csv.reader(f)
        rows_check = list(reader)
    print(f"Verification: {len(rows_check)} rows in output (including header)")

    # Check for remaining em-dashes
    em_dash_count = 0
    for i, row in enumerate(rows_check[1:], 2):
        if len(row) > 7 and '—' in row[7]:
            em_dash_count += 1
            print(f"  WARNING: em-dash still in line {i}: {row[1]}")
    if em_dash_count == 0:
        print("All em-dashes removed successfully!")
    else:
        print(f"WARNING: {em_dash_count} messages still contain em-dashes")

if __name__ == '__main__':
    main()
