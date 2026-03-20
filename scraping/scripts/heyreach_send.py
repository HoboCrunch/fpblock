#!/usr/bin/env python3
"""
Send top 40 ICP-scored leads to HeyReach campaign via API.
Updates scheduling URL in messages before sending.
"""

import csv
import os
import json
import requests

# Config
CSV_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'enriched_speakers.csv')
API_KEY = os.environ.get('HEYREACH_API_KEY')
BASE_URL = 'https://api.heyreach.io/api/public'
CAMPAIGN_ID = 367893
LIST_ID = 576319
TOP_N = 40

OLD_CTA = 'you can schedule with me at gofpblock.com.'
NEW_CTA = 'feel free to schedule here - https://calendly.com/jbcarthy-fpcomplete/ethcc-1-1'

HEADERS = {
    'X-API-KEY': API_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
}


def load_top_leads():
    """Load CSV, filter to those with LinkedIn URLs, return top N by ICP score."""
    with open(CSV_PATH, newline='') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    with_li = [r for r in rows if r.get('LinkedIn', '').strip() and r.get('Score', '').strip()]
    with_li.sort(key=lambda r: int(r['Score']), reverse=True)
    return with_li[:TOP_N]


def update_message(msg):
    """Replace old scheduling CTA with new Calendly link."""
    return msg.replace(OLD_CTA, NEW_CTA)


def split_name(full_name):
    """Split 'FIRST LAST' into (first, last)."""
    parts = full_name.strip().split()
    if len(parts) >= 2:
        return parts[0].title(), ' '.join(parts[1:]).title()
    return full_name.title(), ''


def build_leads_payload(leads):
    """Build the leads array for AddLeadsToListV2."""
    payload_leads = []
    for lead in leads:
        first, last = split_name(lead['Name'])
        updated_msg = update_message(lead['Message'])
        entry = {
            'firstName': first,
            'lastName': last,
            'profileUrl': lead['LinkedIn'].strip(),
        }
        if lead.get('Email', '').strip():
            entry['email'] = lead['Email'].strip()
        if lead.get('Company', '').strip():
            entry['company'] = lead['Company'].strip()
        if lead.get('Role', '').strip():
            entry['position'] = lead['Role'].strip()
        payload_leads.append(entry)
    return payload_leads


def add_leads_to_list(leads_payload):
    """POST leads to the HeyReach list."""
    body = {
        'listId': LIST_ID,
        'leads': leads_payload,
    }
    resp = requests.post(
        f'{BASE_URL}/list/AddLeadsToListV2',
        headers=HEADERS,
        json=body,
    )
    return resp


def main():
    if not API_KEY:
        print('ERROR: HEYREACH_API_KEY not set in environment')
        return

    # 1. Verify API key
    print('Checking API key...')
    r = requests.get(f'{BASE_URL}/auth/CheckApiKey', headers=HEADERS)
    if r.status_code != 200:
        print(f'API key check failed: {r.status_code}')
        return
    print('API key valid.')

    # 2. Load top 40 leads
    leads = load_top_leads()
    print(f'\nLoaded {len(leads)} leads (score range: {leads[-1]["Score"]}-{leads[0]["Score"]})')

    # 3. Show preview
    print('\nLeads to add to campaign:')
    for i, lead in enumerate(leads):
        updated_msg = update_message(lead['Message'])
        has_calendly = 'calendly.com' in updated_msg
        print(f'  {i+1:2d}. {lead["Name"]:<30s} | Score: {lead["Score"]} | Calendly link: {has_calendly}')

    # 4. Build payload
    leads_payload = build_leads_payload(leads)

    # 5. Save updated messages to a JSON file for reference
    output = []
    for lead, payload in zip(leads, leads_payload):
        output.append({
            'name': lead['Name'],
            'score': lead['Score'],
            'linkedin': lead['LinkedIn'],
            'email': lead.get('Email', ''),
            'company': lead.get('Company', ''),
            'updated_message': update_message(lead['Message']),
            'payload': payload,
        })

    out_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'heyreach_batch.json')
    with open(out_path, 'w') as f:
        json.dump(output, f, indent=2)
    print(f'\nSaved batch data to {out_path}')

    # 6. Send to HeyReach list
    print(f'\nAdding {len(leads_payload)} leads to list {LIST_ID}...')
    resp = add_leads_to_list(leads_payload)
    print(f'Response: {resp.status_code}')
    if resp.text:
        try:
            print(json.dumps(resp.json(), indent=2))
        except Exception:
            print(resp.text)

    # 7. Update CSV with sent status
    if resp.status_code == 200:
        sent_names = {lead['Name'] for lead in leads}
        all_rows = []
        with open(CSV_PATH, newline='') as f:
            reader = csv.DictReader(f)
            fieldnames = reader.fieldnames
            for row in reader:
                if row['Name'] in sent_names:
                    row['Message'] = update_message(row['Message'])
                all_rows.append(row)

        with open(CSV_PATH, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(all_rows)
        print(f'\nUpdated {len(sent_names)} messages in CSV with new Calendly link.')
    else:
        print('\nSkipped CSV update due to API error.')


if __name__ == '__main__':
    main()
