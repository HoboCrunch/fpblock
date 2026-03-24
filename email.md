# Sending Scaled Outreach Emails with SendGrid + AI Agent

A practical guide for using the SendGrid API with Claude Code (or any AI agent) to send personalized outreach at scale.

---

## SendGrid Setup

1. **Create a SendGrid account** at sendgrid.com
2. **Verify a sender identity** — either a single sender (quick) or full domain authentication (better deliverability)
3. **Generate an API key** at Settings > API Keys — give it "Full Access" or at minimum "Mail Send" permissions
4. **Store the key** as an environment variable: `SENDGRID_API_KEY`

---

## The Send Endpoint

Everything goes through one endpoint:

```
POST https://api.sendgrid.com/v3/mail/send
```

Headers:
```
Authorization: Bearer $SENDGRID_API_KEY
Content-Type: application/json
```

### Full Request Body (all the levers you can pull)

```json
{
  "personalizations": [
    {
      "to": [{ "email": "recipient@example.com", "name": "Jane Doe" }],
      "subject": "Custom subject per recipient"
    }
  ],
  "from": { "email": "jb@yourdomain.com", "name": "JB" },
  "reply_to": { "email": "jb@yourdomain.com", "name": "JB" },
  "subject": "Default subject (overridden by personalizations if set)",
  "content": [
    {
      "type": "text/plain",
      "value": "Plain text fallback"
    },
    {
      "type": "text/html",
      "value": "<p>HTML version with <a href='https://gofpblock.com/jb'>formatting</a></p>"
    }
  ],
  "tracking_settings": {
    "click_tracking": { "enable": true },
    "open_tracking": { "enable": true }
  }
}
```

### What You Control Per Email

| Field | Where | What it does |
|-------|-------|-------------|
| `from.email` | top-level | The sender address (must be verified) |
| `from.name` | top-level | Display name — "JB", "Wes Crook", etc. |
| `reply_to` | top-level | Where replies go (can differ from `from`) |
| `subject` | personalizations | Subject line — unique per recipient |
| `to` | personalizations | Recipient email + display name |
| `content` | top-level | Body — plain text and/or HTML |
| `headers` | personalizations | Custom headers per recipient |
| `categories` | top-level | Tags for analytics ("ethcc-outreach", "tier1") |

### Batch Sending (Multiple Recipients, Unique Content)

Each object in `personalizations` is a separate email. You can send up to **1,000 personalizations per API call**:

```json
{
  "personalizations": [
    {
      "to": [{ "email": "person1@co.com", "name": "Alice" }],
      "subject": "Alice — quick question about your talk",
      "substitutions": { "{{name}}": "Alice", "{{cta_link}}": "https://gofpblock.com/jb" }
    },
    {
      "to": [{ "email": "person2@co.com", "name": "Bob" }],
      "subject": "Bob — saw your panel, had a thought",
      "substitutions": { "{{name}}": "Bob", "{{cta_link}}": "https://gofpblock.com/jb" }
    }
  ],
  "from": { "email": "jb@yourdomain.com", "name": "JB" },
  "content": [
    {
      "type": "text/plain",
      "value": "Hey {{name}}, ... check out {{cta_link}}"
    }
  ]
}
```

---

## Using with Claude Code

The workflow: give Claude your CSV/list of contacts, your tone, and let it generate the full API payloads.

### Example prompt

> Here's my contact list (CSV attached or pasted). For each person, write a personalized outreach email in my tone. Then construct the SendGrid API call to send them. Use `jb@domain.com` as the sender. Batch into groups of 50. Include the CTA link https://gofpblock.com/jb.

Claude can:
- Read your contact CSV
- Generate unique subject lines and body copy per recipient
- Build the full `curl` or `fetch` call with proper JSON
- Batch into multiple API calls if needed
- Track which emails were sent vs. failed

### Sending via curl (what Claude would generate)

```bash
curl -X POST https://api.sendgrid.com/v3/mail/send \
  -H "Authorization: Bearer $SENDGRID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "personalizations": [{"to": [{"email": "jane@co.com"}], "subject": "Quick note"}],
    "from": {"email": "jb@yourdomain.com", "name": "JB"},
    "content": [{"type": "text/plain", "value": "Hey Jane, ..."}]
  }'
```

A `202 Accepted` response means queued for delivery. No response body.

---

## Deliverability Best Practices

- **Authenticate your domain** — set up SPF, DKIM, and DMARC in SendGrid's Sender Authentication settings. This is the single biggest factor.
- **Warm up gradually** — don't blast 500 emails day one. Start with 20-50/day and ramp over 2-3 weeks.
- **Use a subdomain** — send from `outreach.yourdomain.com` so your main domain reputation stays clean.
- **Plain text > heavy HTML** — for cold outreach, plain text emails with minimal formatting land better and feel more personal.
- **Keep it short** — under 150 words for cold outreach. One clear CTA.
- **Respect unsubscribes** — SendGrid can auto-add unsubscribe links. Use them.
- **Monitor bounce rates** — if bounces exceed 5%, stop and clean your list. SendGrid will suspend you otherwise.
- **Space sends out** — don't send all 200 in one burst. Use SendGrid's `send_at` field or batch over hours.

### Rate Limits

- Free tier: 100 emails/day
- Essentials: 100K/month
- API rate limit: ~600 requests/minute on send endpoint

---

## Tone Profiles

### JB's Tone
Direct, conversational, no fluff. Talks like a peer — not a salesperson. Asks questions instead of pitching. Short sentences. Casual but smart. Comfortable referencing specific things someone has built or said. Doesn't over-explain what FP Block does — lets curiosity do the work.

Example:
> Hey [Name] — caught your talk on [topic]. The way you framed [specific point] stuck with me. We're doing something adjacent at FP Block that I think you'd find interesting. Would love to swap notes if you're around in Cannes. Here's a bit more context: gofpblock.com/jb

### Wes's Tone
Philosophical but grounded. Leads with ideas, not products. Frames everything through permanence, ownership, and incentive design. Avoids jargon — explains concepts through analogies and first principles. Warm but intellectually rigorous. Speaks like someone who's thought deeply about why systems work the way they do, not just how.

Example:
> [Name] — your work on [topic] resonated with something I've been thinking about a lot: how do you build systems where the incentives actually hold up over time? That's the core question behind what we're building at FP Block. I'd love to hear your perspective — especially given [specific reference]. More here if you're curious: gofpblock.com/wes

---

## CTA Pages

| Person | Link |
|--------|------|
| JB | [gofpblock.com/jb](https://gofpblock.com/jb) |
| Wes | [gofpblock.com/wes](https://gofpblock.com/wes) |

Use the appropriate link based on who's "sending" the email. The CTA page should do the heavy lifting on explaining FP Block — the email just needs to get them curious enough to click.

---

## Quick Reference: Common API Calls

**Check email activity:**
```
GET https://api.sendgrid.com/v3/messages?limit=10
```

**Get bounce list:**
```
GET https://api.sendgrid.com/v3/suppression/bounces
```

**Get stats:**
```
GET https://api.sendgrid.com/v3/stats?start_date=2026-03-01
```

**Delete a bounce (re-enable sending to that address):**
```
DELETE https://api.sendgrid.com/v3/suppression/bounces/{email}
```

All use the same `Authorization: Bearer $SENDGRID_API_KEY` header.
