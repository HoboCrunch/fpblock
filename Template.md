# Miami Dinner — Email Templates

**Campaign goal:** drive Luma signups → https://luma.com/k0y45b3p
**Event:** Closed, invite-only dinner. Tuesday 6 May 2026, evening, Miami. Hosts: Aaron Contorer (Founder/Chair, FP Block; former Microsoft exec, technical advisor to Bill Gates, Visual C++ lead, 18 patents) and Wes Crook (CEO, FP Block; 35+ yrs enterprise tech leadership, Capgemini/CGI, Forbes Tech Council).
**The hook:** upmarket restaurant in Miami, hand-picked seat, real conversation with a former Microsoft executive who advised Bill Gates and built the engineering orgs serious companies depend on.
**CTA in every email:** Luma link. No fpblock.com link, no calendar link, nothing else.

---

## Voice rules

- Short. 2–4 sentences in the body. Don't pad — the per-quadrant intro is the whole personalization.
- Peer tone, not pitch. Aaron and Wes are the draw — name them, don't oversell them.
- One CTA. Always the Luma link. Never two asks.
- Avoid: "exclusive opportunity", "thought leader", "synergies", emoji, exclamation points.
- Frame the conversation as building and scaling networks & applications securely and on time — not as "blockchain enterprises" or other crypto jargon.
- Subject line is fixed across all quadrants: `Invite For {{first_name}} - Miami Dinner With Ex-Microsoft Exec & Bill Gates Advisor, Aaron Contorer`
- No "this week" — the dinner is **next Tuesday, May 6**. Always say "Tuesday" or "May 6" or "next Tuesday".

## Variables

Pulled from `email-napalm.csv`:

- `{{first_name}}` — `full_name` first token; fall back to `"there"` if blank.
- `{{company}}` — `company` column; if blank, omit the clause that uses it.

## Sender / signature

From: Wes Crook <wes@fpblock.com> (or Aaron, depending on send strategy)
Sig:

```
Wes
CEO, FP Block
```

---

## Q1 — Consensus speakers (156 contacts)

These people are definitely in Miami. They're on stage. We can be direct and reference Consensus by name.

### Subject

`Invite For {{first_name}} - Miami Dinner With Ex-Microsoft Exec & Bill Gates Advisor, Aaron Contorer`

### Body

```
Hi {{first_name}},

Saw you're speaking at Consensus. Aaron Contorer (founder of FP Block — former Microsoft exec, technical advisor to Bill Gates, ran Visual C++) and I are hosting a small private dinner in Miami next Tuesday evening, upmarket restaurant, hand-picked room — real conversation about what it takes to build and scale networks & applications securely and on time.

Invite-and-apply only; the link below is yours. Time and venue go out on confirmation.

https://luma.com/k0y45b3p

Wes
CEO, FP Block
```

---

## Q2 — C-suite / engineering at Consensus sponsor or partner orgs (705 contacts)

Almost certainly in Miami. Reference the company's presence at Consensus rather than assuming the individual is on stage.

### Subject

`Invite For {{first_name}} - Miami Dinner With Ex-Microsoft Exec & Bill Gates Advisor, Aaron Contorer`

### Body

```
Hi {{first_name}},

Saw {{company}} is at Consensus. Aaron Contorer (founder of FP Block — former Microsoft exec, technical advisor to Bill Gates, ran Visual C++) and I are hosting a small private dinner in Miami next Tuesday evening, upmarket restaurant, hand-picked room — built around the conversation people actually want to have about scaling networks & applications that ship securely and on time.

Closed event, by application. Link is yours; venue details go out on confirmation.

https://luma.com/k0y45b3p

Wes
CEO, FP Block
```

---

## Q3 — Speakers / sponsor C-suite & engineering at other tracked events (489 contacts)

We don't know if they're in Miami. They're proven operators (EthCC 9, DC Blockchain Summit). Open with uncertainty, make the ask easy to ignore if they're not in town.

### Subject

`Invite For {{first_name}} - Miami Dinner With Ex-Microsoft Exec & Bill Gates Advisor, Aaron Contorer`

### Body

```
Hi {{first_name}},

Long shot — not sure if you're in Miami next week. Aaron Contorer (founder of FP Block — former Microsoft exec, technical advisor to Bill Gates, ran Visual C++) and I are hosting a small private dinner Tuesday May 6 evening, upmarket restaurant, hand-picked room — real conversation about what it takes to build networks & applications that ship securely and on time, even under pressure.

Came across your work at {{company}} and thought you'd belong at the table. If you happen to be in town, the link below is yours.

https://luma.com/k0y45b3p

Wes
CEO, FP Block
```

---

## Q4 — All other persons (1,083 contacts)

We don't know if they'll be in Miami and we don't have a hook to a specific event. Lead with the credentials — Aaron's background is the draw.

### Subject

`Invite For {{first_name}} - Miami Dinner With Ex-Microsoft Exec & Bill Gates Advisor, Aaron Contorer`

### Body

```
Hi {{first_name}},

Aaron Contorer (founder of FP Block — former Microsoft exec, technical advisor to Bill Gates, ran Visual C++, 18 patents) and I are hosting a private dinner in Miami on Tuesday May 6 evening. Upmarket restaurant, hand-picked room — the kind of evening where you actually get to think out loud with people building things that have to work.

Your work at {{company}} put you on the list. If you're in Miami that week, the link below is yours.

https://luma.com/k0y45b3p

Wes
CEO, FP Block
```

---

## Bump 1 — Final call (Q1 + Q2 + Q3, no-reply)

Sent Monday May 4 (afternoon → evening), targeting recipients in Q1/Q2/Q3 who haven't replied. Source list: `email-napalm-no-replies.csv`. Lands ahead of Consensus opening Tuesday May 5. Two FP Block events on the table:

- **Penthouse Networking** — Tuesday May 5 evening (the main, bigger room): https://luma.com/00kpa20f
- **Private Dinner** — Wednesday May 6 evening (smaller, invite-only): https://luma.com/k0y45b3p

Same subject as the original send so it threads in their inbox. Tone is a peer-style nudge with real timing pressure — not a discount, not a guilt trip. Two CTAs is a deliberate exception to the global "one CTA" rule; the recipient now has a real choice between formats.

### Subject

`Re: Invite For {{first_name}} - Miami Dinner With Ex-Microsoft Exec & Bill Gates Advisor, Aaron Contorer`

### Body

```
Hi {{first_name}},

Quick bump here, Aaron and I have two opportunities in Miami this week: [Penthouse Networking tomorrow night](https://luma.com/00kpa20f) and a [private dinner Wednesday](https://luma.com/k0y45b3p). Rooms are filling up and final details are going out shortly, want to make sure you have a chance to RSVP.

If you'd like in to either, the links above are yours.

Wes
CEO, FP Block
```

### Notes

- **Do not** add `{{company}}` here — the original send already personalized; the bump is short on purpose.
- The urgency is open-ended ("rooms are filling up and final details are going out shortly") — closing-window pressure without a hard deadline that could be falsified.
- The body uses markdown-link syntax `[text](url)`. The current `scripts/send-outreach.ts → bodyToHtml` only auto-links bare URLs — to render these as anchor tags, extend `bodyToHtml` to convert `[text](url)` → `<a href="url">text</a>` *before* the bare-URL pass.
- Threading: send as a reply to the original outbound (use the original RFC `Message-ID` in `In-Reply-To`/`References`) so it lands in the existing thread. Caveat: SendGrid's API `x-message-id` we logged ≠ the stamped RFC Message-ID; without that mapping, fall back to a `Re:` subject only — most clients still group by subject + participants.
- Suppress anyone in the campaign-replier list (already excluded by `email-napalm-no-replies.csv`); never bump someone who answered.

---

## Sender alternation note

Aaron carries more pull on cold sends to Q4 / unknown audiences (the credentials *are* the pitch). Wes carries more pull on warmer cohorts (Q1/Q2) where the relationship to the work, not the resume, is doing the work. Default plan: Wes on Q1+Q2, Aaron on Q3+Q4 — easy to swap based on early reply rates.

## Reply handling

All four templates end with the Luma link as the only ask. No "let me know" double-CTA. If someone replies asking about venue/time, the answer is: "Confirmed once you apply — venue stays off the public page so the room stays small."

## Pre-send checklist

- [ ] Sender domain warmed and authenticated (SPF/DKIM/DMARC).
- [ ] Skip rows where `email_bounced = true` (cross-reference at send time).
- [ ] Suppress duplicates by email (a person in multiple quadrants should send once, prefer the lower-numbered quadrant — Q1 > Q2 > Q3 > Q4).
- [ ] Throttle per the SendGrid sender-reputation guide in `email.md`.
