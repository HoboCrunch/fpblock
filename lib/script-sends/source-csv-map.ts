// lib/script-sends/source-csv-map.ts
// Maps each send-log JSONL basename to the candidate source CSV paths (relative
// to repo root) that contain the bodies the script actually sent. Resolution
// walks the array in order; first (person_id, subject) match wins.

export const SOURCE_CSV_MAP: Record<string, string[]> = {
  "send_log.jsonl": [
    "consensus/outreach_messages.csv",
    "consensus/outreach_messages_employees.csv",
  ],
  "miami_dinner_send_log.jsonl": [
    "email-napalm.csv",
    "email-napalm-q1q2.csv",
    "email-napalm-q3.csv",
    "email-napalm-q4-half.csv",
    "email-napalm-no-replies.csv",
  ],
  "miami_dinner_bump1_send_log.jsonl": [
    "email-napalm-bump1.csv",
    "email-napalm-bump1-q1q2.csv",
    "email-napalm-bump1-q3.csv",
  ],
};

export const LOG_PATHS: Record<string, string> = {
  "send_log.jsonl": "consensus/send_log.jsonl",
  "miami_dinner_send_log.jsonl": "consensus/miami_dinner_send_log.jsonl",
  "miami_dinner_bump1_send_log.jsonl": "consensus/miami_dinner_bump1_send_log.jsonl",
};
