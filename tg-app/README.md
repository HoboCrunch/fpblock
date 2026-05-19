# tg-app

Send Telegram DMs from a CSV via your **personal account** using the MTProto API
(Telethon). Isolated from the parent project — own venv, own `.env`, own session
files.

## Setup

```bash
cd tg-app
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# fill in TG_API_ID, TG_API_HASH, TG_PHONE from https://my.telegram.org/apps
```

First run prompts for the SMS login code and 2FA password (if enabled) and
saves the session to `sessions/<TG_SESSION_NAME>.session`. Subsequent runs
reuse it.

## CSV format

Header row required. Minimum columns:

| column     | required | notes                                           |
| ---------- | -------- | ----------------------------------------------- |
| identifier | yes      | `@username`, `+E.164` phone, or numeric user_id |
| message    | yes      | supports `{column}` placeholders                |

Any extra columns (e.g. `name`, `org`) are available as `{name}`, `{org}` in
the message template.

See `data/contacts.example.csv`.

## Run

```bash
# dry run (prints what it would send, no API calls beyond auth)
python send_messages.py data/contacts.csv --dry-run

# send for real
python send_messages.py data/contacts.csv

# cap a run
python send_messages.py data/contacts.csv --limit 25
```

`logs/sent.log` is the source of truth for what's been sent — re-running the
same CSV skips identifiers that already have an `OK` row, so resuming is safe.

## Safety notes

- Personal accounts can be rate-limited or banned for spammy behavior.
  `SEND_DELAY_SECONDS` + `SEND_JITTER_SECONDS` add randomized pauses between
  sends; the script handles `FloodWaitError` (sleeps and retries once) and
  stops the run on `PeerFloodError` (Telegram is telling you to back off).
- Set `MAX_SENDS_PER_RUN` in `.env` for a hard ceiling.
- `.env`, `sessions/`, `logs/`, and any non-example CSVs in `data/` are
  gitignored.
