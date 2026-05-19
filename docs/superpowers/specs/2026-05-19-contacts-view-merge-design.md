# Contacts View Merge — Design

**Date:** 2026-05-19
**Status:** Approved (design phase)

## Summary

Merge `/admin/persons` and `/admin/organizations` into a single `/admin/contacts` page with a header-level tab toggle between **Persons** and **Organizations**. Detail routes and all cross-references stay intact; only the two list pages and the sidebar entry change.

## Motivation

Persons and Organizations are the two halves of the same contact graph. Today they live in separate top-level sidebar entries with their own routes and table clients, even though users move between them constantly (look up an org → jump to its people → back to orgs). Consolidating them into one "Contacts" surface with tabs:

- Removes one sidebar entry, reducing navigation overhead.
- Makes the conceptual unit ("contacts") match the IA.
- Sets up a single home for cross-entity workflows in the future.

## Scope

**In scope:**
- New `/admin/contacts` route with `?tab=persons|organizations` query param.
- Replacement of the two sidebar entries with a single "Contacts" entry.
- Redirects from the old list routes.
- Breadcrumb mapping for both detail-route parents → "Contacts".
- Extraction of the org-loading server logic into `lib/data/load-org-rows.ts` so the new contacts page can call it side-by-side with `loadPersonRows()`.

**Out of scope:**
- Any change to the table clients themselves (filters, columns, bulk actions, preview panels stay as-is).
- Any change to `/admin/persons/[id]` or `/admin/organizations/[id]` detail pages.
- Any consolidation of person↔org data models or relations.
- Cross-tab unified selection or bulk actions.

## URL Design

| Old | New |
| --- | --- |
| `/admin/persons` | `/admin/contacts?tab=persons` |
| `/admin/organizations` | `/admin/contacts?tab=organizations` |
| `/admin/persons/[id]` | unchanged |
| `/admin/organizations/[id]` | unchanged |

`/admin/contacts` with no `tab` query param defaults to `persons`. Unknown `tab` values fall back to `persons`. The active tab is reflected in the URL via `router.replace` (shallow, no scroll) so deep links and back/forward navigation work.

The two old list routes (`/admin/persons`, `/admin/organizations`) are reduced to one-line redirect pages that 308-redirect to the new route with the appropriate `?tab=` value. This preserves any external bookmarks.

## Components

### New files

- **`app/admin/contacts/page.tsx`** — server component.
  - Parses `tab` from `searchParams`.
  - In parallel via `Promise.all`, calls:
    - `loadPersonRows(supabase)` — existing util.
    - `loadOrgRows(supabase)` — new util (see below).
  - Renders `<ContactsTabsClient>` with both result objects and the active tab.

- **`app/admin/contacts/contacts-tabs-client.tsx`** — client component.
  - Receives `personData`, `orgData`, `initialTab`.
  - Local `activeTab` state, initialized from `initialTab`, synced back to the URL on change via `router.replace('/admin/contacts?tab=…', { scroll: false })`.
  - Renders:
    - A pill-style segmented control: `[ Persons (N) ]  [ Organizations (M) ]`. Counts derived from the row arrays. Glass styling consistent with other admin pills.
    - Both `<PersonsTableClient>` and `<OrganizationsTableClient>` mounted; the inactive one wrapped in a `hidden`-attributed div so its filter/search/selection state stays alive when toggling.

- **`lib/data/load-org-rows.ts`** — new util extracted from `app/admin/organizations/page.tsx`.
  - Exports `loadOrgRows(supabase)` returning `{ rows, filterOptions, orgPeopleMap }` matching the props `<OrganizationsTableClient>` already expects.
  - Encapsulates the `fetchInBatches` helper, the parallel data fetches, and all lookup-map building currently inline in `app/admin/organizations/page.tsx`.
  - Mirrors the shape of `lib/data/load-person-rows.ts`.

### Modified files

- **`app/admin/persons/page.tsx`** — replaced with a one-liner that calls Next's `redirect('/admin/contacts?tab=persons')`.
- **`app/admin/organizations/page.tsx`** — replaced with a one-liner that calls Next's `redirect('/admin/contacts?tab=organizations')`.
- **`components/admin/sidebar.tsx`** — remove the `Persons` and `Organizations` entries; insert one `Contacts` entry using the `Users` icon, `href: '/admin/contacts'`. Position: where `Persons` is today.
- **`components/admin/breadcrumb.tsx`** — adjust the segment-label mapping so that on `/admin/persons/[id]` and `/admin/organizations/[id]` detail routes, the parent crumb reads **Contacts** (linking to the appropriate `?tab=`), not "Persons" or "Organizations". The crumb structure becomes `Admin > Contacts > {Entity Name}`. Implementation: extend the crumb builder so when a segment is `persons` or `organizations`, its label becomes `Contacts` and its href becomes `/admin/contacts?tab={segment}`.

### Untouched

- `app/admin/persons/persons-table-client.tsx` — no changes.
- `app/admin/organizations/organizations-table-client.tsx` — no changes (the only thing moving out is the page-level fetch logic from its sibling `page.tsx`).
- `app/admin/persons/[id]/page.tsx`, `app/admin/organizations/[id]/page.tsx` — no changes.
- `app/admin/persons/person-table-row.tsx`, `app/admin/persons/person-preview-panel.tsx`, `app/admin/organizations/org-table-row.tsx`, `app/admin/organizations/org-preview-card.tsx` — no changes.
- All `/admin/persons/{id}` and `/admin/organizations/{id}` deep links across inbox, events, lists, sequences, initiatives, enrichment, drag-card, person-correlation-summary, interactions-timeline — no changes required.

## Data Flow

1. Browser hits `/admin/contacts?tab=organizations`.
2. Server component reads `tab`, kicks off `Promise.all([loadPersonRows(supabase), loadOrgRows(supabase)])`.
3. Both result sets are passed to `<ContactsTabsClient initialTab="organizations" personData={...} orgData={...} />`.
4. Client mounts both table clients; only the Organizations one is visible (Persons one is `hidden`).
5. User clicks the **Persons** tab.
   - `router.replace('/admin/contacts?tab=persons', { scroll: false })` — URL updates, no server round-trip.
   - Local state flips; the Persons table becomes visible, the Organizations table goes `hidden`. Filters/search/selection on each side remain intact.

## Tab UI

- Segmented control rendered at the top of the contacts page, **above** any per-table toolbars (search bars, filter chips, action menus stay where they are inside each table client — they continue to read like the existing single-purpose pages).
- Visual treatment: glass pill container, two segments, active segment uses the accent fill used elsewhere in the admin pill components.
- Counts beside each label: `Persons (237)`, `Organizations (412)`. Pulled from `personData.rows.length` and `orgData.rows.length` on the server-side render.
- Keyboard: tab through and `Enter`/`Space` to activate, matching native radio-group semantics.

## Trade-offs

### Fetch both upfront vs. fetch active tab only

We fetch both data sets on every visit to `/admin/contacts`. This makes tab-switching instant and preserves per-tab state without lifting it out of the existing table clients. The cost is a slightly slower initial page load than today's individual pages — but the existing pages already load both quickly in absolute terms, and the new page parallelizes the two fetches.

If this turns out to be too slow in practice, the future-friendly out is to switch to per-tab fetching: keep the server component as-is, but conditionally only call the active tab's loader, and make tab switching a `router.push` that triggers a server re-render. The client component contract wouldn't need to change.

### Mount-both vs. unmount-on-switch

We mount both `<PersonsTableClient>` and `<OrganizationsTableClient>` and toggle visibility, rather than conditionally rendering one or the other. Mount-both costs a one-time render of the inactive tree (cheap — it's all client state, no data fetching) and buys us automatic preservation of filters / search / selection / scroll position across tab toggles without touching either component's internal state model.

### Breadcrumb rewrite

We retitle the `persons` and `organizations` path segments as "Contacts" in the breadcrumb. This means on a person detail page, the crumb says `Admin > Contacts > Jane Doe`, not `Admin > Persons > Jane Doe`. The information loss (which kind of contact you're looking at) is minor in context — the detail page itself makes the entity type obvious — and the IA consistency is worth it. The crumb link target uses `?tab=persons` or `?tab=organizations` so clicking "Contacts" from a person detail lands you back on the Persons tab.

## Testing

Manual verification in the browser after implementation:

- `/admin/contacts` (no query) — loads, Persons tab active, count badges accurate.
- `/admin/contacts?tab=organizations` — loads with Organizations tab active.
- `/admin/contacts?tab=garbage` — falls back to Persons.
- `/admin/persons` and `/admin/organizations` — redirect to the new route with the correct tab.
- Click between tabs — URL updates, no full reload, filters / search / selection survive.
- Back/forward across tab toggles — works.
- Sidebar shows single "Contacts" entry; clicking it lands on Persons tab.
- Breadcrumb on `/admin/persons/[id]` and `/admin/organizations/[id]` shows `Admin > Contacts > {Name}`; clicking "Contacts" returns to the appropriate tab.
- All inbound deep links from other admin pages (inbox, events, sequences, lists, initiatives, enrichment, drag-card, interactions-timeline) still resolve correctly to detail pages.

Type-check via `pnpm tsc --noEmit` (or project equivalent) must pass.

## Open Questions

None — design fully specified.
