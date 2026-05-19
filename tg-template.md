# Miami Dinner — Telegram Templates (JB / @jbcarthy)

**Campaign goal:** drive Luma signups → https://luma.com/k0y45b3p
**Event:** Closed, invite-only dinner. Tuesday 6 May 2026, evening, Miami. Hosts: Aaron Contorer (Founder/Chair, FP Block — former Microsoft exec, technical advisor to Bill Gates, Visual C++ lead, 18 patents) and Wes Crook (CEO).
**Sender:** JB Carthy, CSO at fpblock.com — sending from his personal Telegram (@jbcarthy).

---

## Voice rules (Telegram-specific)

- **Casual.** This is a DM, not a cold email. Lower-case openings are fine, contractions encouraged, no formal sign-off block.
- **Short.** 2–4 sentences max. Telegram bubbles long messages into walls — keep it scannable on a phone.
- **JB introduces himself once.** First line names him + role. Skip the corporate signature block at the end.
- **One CTA.** Always the Luma link, last line, on its own.
- **Lead with the human, not the resume.** Aaron's credentials still close, but the Telegram tone is "I want you at this dinner," not a press release.
- **Ditch the press-release verbs.** No "hosting," no "convening," no "gathering of leaders." Try "putting together," "doing," "running."
- **No emoji, no exclamation points.** Casual ≠ cringe.
- **Avoid crypto jargon** (blockchain, DeFi, Web3, on-chain, TVL). Frame the work as "building and scaling networks & applications that ship securely."
- **No subject line** (Telegram has none).
- **No "this week"** — the dinner is **next Tuesday, May 6**. Always say "Tuesday" or "May 6."

## Variables

Pulled from `tg-napalm.csv`:

- `{first_name}` — `full_name` first token; fall back to `there` if blank.
- `{company}` — `company` column; if blank, soften the line that uses it.

## Inferred-from-X handles

`telegram_inferred = true` rows are guesses derived from the person's X handle. They may not exist on Telegram or may belong to someone else. Recommended: send Q1+Q2 first (highest signal, lowest inference rate), watch for `UserPrivacyRestrictedError` and `username not occupied` errors, and consider skipping `telegram_inferred=true` rows on first pass.

---

## Q1 — Consensus speakers (97 contacts)

In Miami for sure. On stage. Be direct.

```
hey {first_name} — JB here, CSO at fpblock.com. saw you're speaking at Consensus.

quick one: my co-founders Aaron Contorer (ex-Microsoft, was Bill Gates' technical advisor, ran Visual C++) and Wes Crook are putting together a small private dinner in Miami next Tuesday evening — upmarket spot, hand-picked room, the kind of conversation people in your seat actually want to have about scaling networks & applications that ship securely and on time.

invite-only and we're keeping the room small. if you're in, the link below is yours — venue goes out on confirmation.

https://luma.com/k0y45b3p
```

---

## Q2 — C-suite / engineering at Consensus sponsor or partner orgs (48 contacts)

Their company is at Consensus; they're almost certainly in town. Reference the company, not their stage time.

```
hey {first_name} — JB here, CSO at fpblock.com. saw {company} is at Consensus, figured you'd be in Miami.

my co-founders Aaron Contorer (ex-Microsoft, technical advisor to Bill Gates, ran Visual C++) and Wes Crook are doing a small private dinner Tuesday evening — upmarket restaurant, hand-picked room, real conversation about scaling networks & applications that ship securely and on time.

closed event, by application — link's yours if you want it. venue details on confirmation.

https://luma.com/k0y45b3p
```

---

## Q3 — Speakers / sponsor C-suite & engineering at other tracked events (109 contacts)

Don't know if they're in Miami. Open with that uncertainty so it's easy to ignore if not.

```
hey {first_name} — JB here, CSO at fpblock.com. long shot, no idea if you're in Miami next week.

my co-founders Aaron Contorer (ex-Microsoft, was technical advisor to Bill Gates, ran Visual C++) and Wes Crook are running a small private dinner Tuesday May 6 evening — upmarket spot, hand-picked room, the kind of evening you actually leave with something. came across your work at {company} and thought you'd belong at the table.

if you happen to be in town, the link below is yours.

https://luma.com/k0y45b3p
```

---

## Q4 — All other persons (680 contacts)

No event hook, lower confidence they're in Miami. Aaron's resume does the work.

```
hey {first_name} — JB here, CSO at fpblock.com. quick reach-out.

my co-founder Aaron Contorer (ex-Microsoft, technical advisor to Bill Gates, ran Visual C++, 18 patents) and our CEO Wes Crook are doing a small private dinner in Miami on Tuesday May 6 — upmarket restaurant, hand-picked room, the kind of evening where you actually get to think out loud with people building things that have to work.

your work at {company} put you on the list. if you're in Miami that week, link's yours.

https://luma.com/k0y45b3p
```

---

## Reply handling

If someone replies asking about venue/time: "confirmed once you apply — venue stays off the public page so the room stays small."

If someone replies with general interest but won't be in Miami: thank them, no follow-up ask. Don't pivot to a sales conversation in a Telegram DM.

## Pre-send checklist

- [ ] First batch limited (start with `--limit 25` on Q1) — Telegram personal accounts get rate-limited fast on cold DMs to non-contacts.
- [ ] Watch for `PeerFloodError` — if it fires, stop the run and slow `SEND_DELAY_SECONDS` / `SEND_JITTER_SECONDS` in `.env.local`.
- [ ] Many recipients will have `UserPrivacyRestrictedError` (DMs blocked from non-contacts). The script logs and continues.
- [ ] `telegram_inferred=true` rows are guesses — consider filtering them out of the first send.
- [ ] Suppress duplicates by handle (a person in multiple quadrants should send once, prefer lower-numbered quadrant — Q1 > Q2 > Q3 > Q4).
