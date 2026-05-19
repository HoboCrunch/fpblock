"""One-time interactive login that doesn't need a TTY.

Step 1 — request a code (Telegram will SMS / in-app it to you):
    python login.py send

Step 2 — sign in with the code:
    python login.py code 12345

If you have 2FA enabled, set TG_2FA_PASSWORD in .env.local before step 2.

Once this completes successfully, sessions/<TG_SESSION_NAME>.session is
saved and send_messages.py will run non-interactively from then on.
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError

ROOT = Path(__file__).resolve().parent
SESSIONS_DIR = ROOT / "sessions"
HASH_FILE = SESSIONS_DIR / ".pending_hash"


def cfg() -> dict:
    load_dotenv(ROOT / ".env.local")
    load_dotenv(ROOT / ".env")
    for k in ("TG_API_ID", "TG_API_HASH", "TG_PHONE"):
        if not os.getenv(k):
            sys.exit(f"missing {k} in env")
    return {
        "api_id": int(os.environ["TG_API_ID"]),
        "api_hash": os.environ["TG_API_HASH"],
        "phone": os.environ["TG_PHONE"],
        "session": os.environ.get("TG_SESSION_NAME", "personal"),
        "password": os.environ.get("TG_2FA_PASSWORD"),
    }


async def send(c: dict) -> None:
    SESSIONS_DIR.mkdir(exist_ok=True)
    client = TelegramClient(str(SESSIONS_DIR / c["session"]), c["api_id"], c["api_hash"])
    await client.connect()
    if await client.is_user_authorized():
        print("already authorized — nothing to do")
        await client.disconnect()
        return
    sent = await client.send_code_request(c["phone"])
    HASH_FILE.write_text(sent.phone_code_hash)
    await client.disconnect()
    print(f"code sent to {c['phone']}. now run: python login.py code <CODE>")


async def code(c: dict, code_value: str) -> None:
    client = TelegramClient(str(SESSIONS_DIR / c["session"]), c["api_id"], c["api_hash"])
    await client.connect()
    if await client.is_user_authorized():
        print("already authorized — nothing to do")
        await client.disconnect()
        return
    if not HASH_FILE.exists():
        await client.disconnect()
        sys.exit("no pending login. run: python login.py send")
    phash = HASH_FILE.read_text().strip()
    try:
        await client.sign_in(c["phone"], code_value, phone_code_hash=phash)
    except SessionPasswordNeededError:
        if not c["password"]:
            await client.disconnect()
            sys.exit("2FA enabled — set TG_2FA_PASSWORD in .env.local and retry")
        await client.sign_in(password=c["password"])
    me = await client.get_me()
    print(f"logged in as @{me.username or me.first_name} (id={me.id})")
    HASH_FILE.unlink(missing_ok=True)
    await client.disconnect()


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in ("send", "code"):
        sys.exit(__doc__)
    c = cfg()
    if sys.argv[1] == "send":
        asyncio.run(send(c))
    else:
        if len(sys.argv) < 3:
            sys.exit("usage: python login.py code <CODE>")
        asyncio.run(code(c, sys.argv[2]))


if __name__ == "__main__":
    main()
