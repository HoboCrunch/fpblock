# HeyReach API Reference

Base URL: `https://api.heyreach.io/api/public`

## Authentication

Every request requires the `X-API-KEY` header.

```
X-API-KEY: <YOUR_API_KEY>
Content-Type: application/json
```

Rate limit: 300 requests/minute. Exceeding returns 429.

---

## Verified Endpoints (tested 2026-03-19)

### Auth

**GET** `/auth/CheckApiKey`
Returns 200 with empty body if valid.

```bash
curl 'https://api.heyreach.io/api/public/auth/CheckApiKey' \
  -H 'X-API-KEY: <KEY>'
```

---

### Campaigns

**POST** `/campaign/GetAll`
List all campaigns with pagination.

```json
{ "offset": 0, "limit": 50 }
```

Response:
```json
{
  "totalCount": 1,
  "items": [
    {
      "id": 367893,
      "name": "Cannes",
      "status": "DRAFT",
      "linkedInUserListId": 0,
      "campaignAccountIds": [],
      "organizationUnitId": 123713
    }
  ]
}
```

**GET** `/campaign/GetById?campaignId={id}`
Get campaign details by ID.

**POST** `/campaign/Pause`
Pause a campaign.

**POST** `/campaign/Resume`
Resume a paused campaign.

---

### Lists

**POST** `/list/GetAll`
List all lead lists with pagination.

```json
{ "offset": 0, "limit": 50 }
```

Response:
```json
{
  "totalCount": 2,
  "items": [
    {
      "id": 576319,
      "name": "EthCC Cannes Top 40",
      "totalItemsCount": 38,
      "listType": "USER_LIST",
      "campaignIds": []
    }
  ]
}
```

**POST** `/list/CreateEmptyList`
Create a new empty lead list.

```json
{ "name": "My List Name" }
```

**POST** `/list/AddLeadsToListV2`
Add leads to an existing list. Max 100 leads per request.

IMPORTANT: The LinkedIn URL field is `profileUrl`, NOT `linkedinUrl`.

```json
{
  "listId": 576319,
  "leads": [
    {
      "firstName": "John",
      "lastName": "Doe",
      "profileUrl": "https://www.linkedin.com/in/johndoe",
      "email": "john@example.com",
      "company": "Acme Corp",
      "position": "CEO"
    }
  ]
}
```

Response:
```json
{
  "addedLeadsCount": 1,
  "updatedLeadsCount": 0,
  "failedLeadsCount": 0
}
```

All lead fields are optional, but you need at least `profileUrl` for LinkedIn outreach.

---

### Leads

**GET** `/lead/GetLead?profileUrl={url}`
Get lead details by LinkedIn profile URL.

**POST** `/lead/UpdateStatus`
Update a lead's status.

---

### Management (Organization)

**POST** `/management/organizations/users/invite/managers`
Invite users as workspace managers.

```json
{
  "inviterEmail": "admin@example.com",
  "emails": ["user1@example.com"],
  "workspaceIds": [1234]
}
```

**GET** `/management/organizations/users/:userId`
Get user info by ID.

**POST** `/management/organizations/users/workspaces/:workspaceId`
List users in a workspace.

```json
{
  "offset": 0,
  "limit": 50,
  "role": "Admin",
  "invitationStatus": ["Accepted", "Pending"]
}
```

---

## Endpoints from Composio/Make (not yet verified)

These are documented in third-party integrations but not yet tested:

| Action | Method | Notes |
|--------|--------|-------|
| Get All LinkedIn Accounts | GET | `limit`, `offset`, `keyword` params |
| Get My Network for Sender | GET | `senderId`, `pageNumber`, `pageSize` params |
| Get Conversations V2 | GET | `limit`, `offset`, `filters` params |
| Get Overall Stats | GET | `dateFrom`, `dateTo`, `accountIds`, `campaignIds` params |
| Get Lists for Lead | GET | `profileUrl` param |
| Get Companies From List | GET | `listId`, `limit`, `offset`, `keyword` params |
| Create Tags | POST | `tags` array with `displayName`, `color` |
| Create Webhook | POST | `eventType`, `webhookUrl`, `webhookName`, `campaignIds` |
| Update Webhook | PATCH | `webhookId` + update fields |
| Delete Webhook | DELETE | `webhookId` |
| Get All Webhooks | GET | `limit`, `offset` |
| Get Webhook by ID | GET | `webhookId` |

---

## Gotchas

- `profileUrl` not `linkedinUrl` for lead LinkedIn URLs
- Campaign endpoints are under `/campaign/`, list endpoints under `/list/`
- Most endpoints are POST even for read operations (pagination in body)
- `GetById` for campaigns uses query param `?campaignId=`, not path param
- Empty 200 response from CheckApiKey is normal (no body)
- Campaign creation and sequence setup must be done in the HeyReach UI (not available via API)
