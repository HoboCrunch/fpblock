# Component Reference

Inventory, design system, and conventions for `components/ui/*` and `components/admin/*`.

> **Companion docs**
> - [admin-ui.md](./admin-ui.md) — IA, shell, per-section overview
> - [data-layer.md](./data-layer.md) — React Query, hooks, Supabase
> - [/PERFORMANCE.md](../../PERFORMANCE.md) — perf/architecture contract

---

## Design system

### Colors — `app/globals.css:3-15`

All colors are CSS variables on `:root` and exposed to Tailwind via the `@theme inline` block (`globals.css:17-25`).

| Token | Value | Usage |
|---|---|---|
| `--bg-app` | `#0f0f13` | App background. Apply via `bg-[var(--bg-app)]` or the Tailwind `bg-background` color. |
| `--foreground` | `#ededed` | Default text on body. |
| `--accent-orange` | `#f58327` | Primary accent. Active nav, primary buttons, ICP highlight, "FP" logo mark. |
| `--accent-indigo` | `#6e86ff` | Secondary accent. Used sparingly (some badges, secondary chips). |
| `--glass-bg` | `#161618` | Glass card surface. |
| `--glass-bg-hover` | `#1c1c1f` | Glass surface on hover. |
| `--glass-border` | `#2a2a2e` | Default glass border. |
| `--glass-border-hover` | `#36363c` | Glass border on hover. |
| `--text-primary` | `#ffffff` | Strong text. |
| `--text-secondary` | `rgba(255,255,255,0.7)` | Body text. |
| `--text-muted` | `rgba(255,255,255,0.4)` | Labels, hints. |

In Tailwind classes, prefer the bracketed form (`text-[var(--text-muted)]`) — the codebase uses this consistently.

### Glass effect

Three utility classes in `globals.css:42-58`:

- `.glass` — `bg-[var(--glass-bg)]` + `1px solid var(--glass-border)`. Compose with `rounded-xl` (`<GlassCard>` does this automatically).
- `.glass-hover` — `:hover` swap to `--glass-bg-hover` + `--glass-border-hover`.
- `.glass-glow` / `.glass-glow-indigo` — `:hover` adds `box-shadow: 0 0 20px rgba(245,131,39,0.08)` (orange) or the indigo equivalent.

`<GlassCard>` (`components/ui/glass-card.tsx:13-37`) is the canonical wrapper; it accepts `hover`, `glow`, and `glowColor: "orange" | "indigo"` props.

### Background grid

`.bg-grid` (`globals.css:34-39`) renders a 48×48 px grid via two linear gradients at 3% opacity. Applied to admin `<main>` (`admin-shell.tsx:37`) as the signature surface.

### Typography

Three Google Fonts loaded in `app/layout.tsx:1-19`:

- `Poppins` (weights 400/500/600/700) → `--font-heading` → use `font-[family-name:var(--font-heading)]`
- `Inter` → `--font-body` → default `body` font (`globals.css:30`)
- `Geist_Mono` → `--font-geist-mono` → keyboard hints, code

Heading numerics: `<StatCard>` uses `font-[family-name:var(--font-heading)] text-3xl font-semibold`. The breadcrumb root crumb uses the same heading family.

### Spacing & radius

- Card radius: `rounded-xl` (12px) on glass cards, `rounded-lg` (8px) on inputs/selects/buttons, `rounded-md` (6px) on small chips and the mobile menu button.
- Card padding: `p-5` default in `<GlassCard>` (toggleable via `padding={false}`).
- Sidebar icon size: `h-[18px] w-[18px]` in a `w-5 h-5` wrapper.
- Sidebar nav item: `px-3 py-2 rounded-lg` (`nav-item.tsx:45`).

### Motion

Defined in `globals.css`:

- `@keyframes fadeSlideDown` (lines 76-85) — used by header dropdown menu (`header.tsx:117`).
- `.subnav-grid` (lines 88-101) — the events sub-nav uses `grid-template-rows: 0fr → 1fr` with a 0.25s `cubic-bezier(0.4, 0, 0.2, 1)` transition.
- `.sidebar-panel` (lines 109-112) — sidebar slide uses `transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)`.

Common Tailwind transitions in components: `transition-all duration-200`, `transition-colors duration-200`, `transition-[width] duration-300`.

### Iconography — lucide-react

The only icon library in the codebase. Verified by `grep -r lucide-react components app/admin -l` — 62 files. No `react-icons`, `heroicons`, or custom SVG sets. Icon sizes: `h-3.5 w-3.5` (compact), `h-4 w-4` (default in inputs), `h-5 w-5` (header/menu buttons), `h-[18px] w-[18px]` (sidebar nav).

---

## `components/ui/*` — primitives

Stateless (or local-state-only) presentational primitives.

| File | Purpose |
|---|---|
| `glass-card.tsx` | Wrapper `<GlassCard>` with `hover`, `glow`, `glowColor`, `padding`, `as`, `onClick`. Composes `glass rounded-xl transition-all duration-200`. |
| `glass-input.tsx` | `<GlassInput>` text input. Forward-refs to `<input>`. Optional left `icon` (lucide). Focus ring: `focus:ring-2 focus:ring-[var(--accent-orange)]/40`. |
| `glass-select.tsx` | `<GlassSelect>` native `<select>` with custom chevron. **Single-select only**; for multi-select use `MultiSelectField` (see `components/admin/`). |
| `badge.tsx` | `<Badge variant>` pill. The `variants` map defines 24 named variants — every interaction status, sponsor tier, seniority, and a few "glass" variants (`glass`, `glass-orange`, `glass-indigo`). Children render inside an internal `<span class="truncate min-w-0">` so badges with `max-w-*` ellipsis cleanly. Optional `title` prop for the tooltip on truncated text. |
| `stat-card.tsx` | `<StatCard label value icon accentColor>` — large numeric display with icon. Used on the Dashboard. |
| `tabs.tsx` | `<Tabs tabs={[{id,label,content}]} defaultTab>` — local-state tab switcher. Used by Settings. **Limitation:** state is internal — not URL-synced. |
| `data-table.tsx` | **Canonical table primitive.** `<DataTable<T>>` wraps `@tanstack/react-virtual` over a CSS-Grid layout. Props: `rows`, `gridTemplate`, `header`, `renderRow`, `getRowKey`, plus optional `onRowClick`, `isRowSelected`, `onRowMouseEnter`/`Leave`, `rowClassName`, `estimateRowHeight`, `scrollHeight`, `minWidth`, `emptyMessage`. Sticky header inside the scroll container. Used by sequences, events, organizations, persons, pipeline, enrichment. |
| `data-cell.tsx` | Cell variants for `DataTable`'s `renderRow`/`header`: `TextCell` (truncated), `NumericCell` (tabular-nums, right-aligned), `PillCell` (overflow-hidden flex container for badges), `DateCell` (whitespace-nowrap, muted), `HeaderCell` (column header with built-in uppercase tracking). All consume the shared `--cell-px` / `--cell-py` / `--cell-py-header` CSS tokens defined in `globals.css :root` so header padding lines up with row padding across surfaces. |

### What is _missing_ from `components/ui/*`

- `<GlassCheckbox>` — the memory note says this is the shared selection control, but the actual code duplicates the same ~15-line button across six files (see [admin-ui.md → Selection model](./admin-ui.md#selection-model)). Highest-value extraction.
- `<Button>` / `<IconButton>` — every button is hand-rolled with cn(...) class strings. Some variant patterns (orange-fill primary, glass-outline secondary, ghost) repeat across 50+ sites.
- `<Modal>` / `<Dialog>` — the message preview modal (`components/admin/message-preview-modal.tsx`) and several inline modals (e.g. Lists, Sequences enrollment) re-implement portal/backdrop/escape-key plumbing.

---

## `components/admin/*` — feature components

Roughly 40 components organized by purpose.

### Shell / navigation
| File | Purpose |
|---|---|
| `sidebar.tsx` | Main sidebar (270 LOC). Memo'd. Owns `collapsed`/`eventsOpen`/`isTablet` state. Renders `mainNavItems` + `bottomNavItems` declared inline at top of file. |
| `nav-item.tsx` | Single nav row. Memo'd. Renders icon + label + active bar; on collapsed/tablet shows `<NavTooltip>` on hover. |
| `nav-tooltip.tsx` | Memo'd portal-anchored tooltip for collapsed sidebar. |
| `header.tsx` | Top bar (157 LOC). Memo'd. Mobile menu, breadcrumb, search hint button (non-functional placeholder), user dropdown with sign-out. |
| `breadcrumb.tsx` | URL → label list. Drives `<Header>` left side. |

### Layout helpers
| File | Purpose |
|---|---|
| `two-panel-layout.tsx` | Main content + collapsible right sidebar with mobile drawer. Used by Sequences. |
| `selection-summary.tsx` | Footer-style summary with selection count + bulk action buttons (20 LOC). |
| `filter-bar.tsx` | Sticky filter row container (44 LOC). |
| `filter-group.tsx` | Collapsible group within a filter sidebar (27 LOC). |
| `active-filters.tsx` | Inline chips representing active filters with `<X>` to clear. Single source of truth for active-filter visualization — multi-select dropdowns no longer render their own chip strips below the trigger; they show "N selected" inside the trigger and rely on this bar for chip removal. Always shows "Clear all" when ≥1 filter; chips use neutral glass styling (orange accent reserved for primary actions). |
| `multi-select-field.tsx` | `<MultiSelectField placeholder options values onChange>` — multi-select dropdown that displays a placeholder, single-label, or "N selected" inside its trigger. Replaces the old `<GlassSelect> + inline chip strip` pattern (had been duplicated 6× in `persons-table-client.tsx`). Has vitest coverage. |
| `search-bar.tsx` | Standard search input wrapper (30 LOC). |
| `summary-cards.tsx` | Generic stat-cards row used by detail pages. |
| `coverage-metrics.tsx` | Mini bar chart of ICP coverage. |
| `data-completeness.tsx` | Per-field completeness display. |

### Tables / rows

All admin tables (sequences, events, organizations, persons, pipeline, enrichment) render through the shared `<DataTable>` primitive in `components/ui/data-table.tsx`. Row components return grid-children fragments rather than `<tr>`/`<td>` trees.

| File | Purpose |
|---|---|
| `initiative-table.tsx` | Initiatives list table. |
| `pipeline-table.tsx` | Pipeline view's table mode — `DataTable` invocation with `TextCell`/`PillCell` columns. Alternative to the kanban view. |
| `message-row.tsx` | Single message row in the sequence message queue. **Exception**: the message queue keeps an HTML `<table>` (with `table-fixed` + `<colgroup>`) because expandable detail rows don't fit `DataTable`'s fixed-height virtualization. |
| `sequence-row.tsx` | Returns grid children consumed by `<DataTable>` in `sequence-list-client.tsx`. |
| `sequence-preview.tsx` | Right-pane sequence detail preview. |

### Pipeline / DnD
| File | Purpose |
|---|---|
| `pipeline-view.tsx` | Wrapper that toggles between Kanban and Table view. |
| `kanban-board.tsx` | Multi-column kanban using `@hello-pangea/dnd`. |
| `kanban-column.tsx` | Single droppable kanban column. |
| `drag-card.tsx` | Draggable card body. |
| `pipeline-bar.tsx` | Horizontal stacked pipeline bar (Dashboard). |

### Detail / timelines
| File | Purpose |
|---|---|
| `interactions-timeline.tsx` | Reusable chronological feed embedded on Person/Org/Event/Initiative detail (294 LOC). |
| `signals-timeline.tsx` | Signals (organization_signals) chronological feed. |
| `activity-feed.tsx` | Recent job_log entries on Dashboard. |
| `activity-log.tsx` | Verbose activity rendering. |
| `identity-card.tsx` | Person/org "header" card with avatar/initials + key fields. |

### Forms / editors
| File | Purpose |
|---|---|
| `step-editor.tsx` | Sequence step add/edit form. |
| `schedule-config.tsx` | Send schedule config (days/hours). |
| `composable-template-editor.tsx` | Block-based template editor (subject/body) (221 LOC). |
| `ai-block-editor.tsx` | Single AI-generated text block. |
| `variable-picker.tsx` | Insert `{{variable}}` chooser. |
| `column-mapper.tsx` | CSV header → DB field mapping UI. |
| `file-dropzone.tsx` | Drag-drop file dropzone for uploads. |
| `event-relation-toggle.tsx` | Two-checkbox `Speaker` / `Org-affiliated` toggle. Tightly coupled to `useEventPersonIds(eventId, relation)`. |

### Correlation / merge
| File | Purpose |
|---|---|
| `correlation-review.tsx` | Side-by-side merge review queue (301 LOC). |
| `correlation-badge.tsx` | Confidence pill (color-coded). |
| `org-correlation-summary.tsx` | Inline correlation summary on org row. |
| `person-correlation-summary.tsx` | Inline correlation summary on person row. |

### Misc
| File | Purpose |
|---|---|
| `add-to-list-dropdown.tsx` | "Add to list" popover used by row actions (also a copy at `app/admin/persons/[id]/add-to-list-dropdown.tsx` — duplicated). |
| `message-preview-modal.tsx` | Modal preview of a generated message (162 LOC). |

---

## Conventions

### When to add to `components/ui/*` vs inline

**Add to `components/ui/`** when:
- The component is purely presentational (no domain types, no Supabase calls).
- Used or _likely to be used_ in three or more places.
- Has no React Query / server-action dependency.

**Add to `components/admin/`** when:
- The component encodes admin-specific structure (e.g. `<InteractionsTimeline>` knows about the `interactions` table shape).
- Reused across more than one admin section.

**Inline (in the page or shell file)** when:
- Single-use sub-component for a specific page (e.g. `OrgPreviewCard` lives next to its only consumer).
- Tightly coupled to local state of one parent.

### Memoization rules

From `PERFORMANCE.md` §2 and observed in code:

1. **Every virtual table row component** is wrapped in `React.memo` with a custom comparator. See `org-table-row.tsx`'s `OrgTableRow` and `person-table-row.tsx:187`'s `PersonTableRow`.
2. **Shell sub-components** (`Sidebar`, `Header`, `NavItem`, `NavTooltip`) are `memo`'d. Without memoization, every navigation re-renders the sidebar's full nav tree.
3. **Callbacks passed to memoized children** must use `useCallback`. The shell does this consistently (`admin-shell.tsx:20-21`, `sidebar.tsx:65-73`).
4. **Memo comparator pattern**: compare by identity for objects (`prev.row === next.row`) and by value for primitives. Avoid deep-equal — rows are immutable per render.

### Server vs client component boundaries

The pattern across the app:

- `app/admin/<section>/page.tsx` is a **server component** when it does heavy data prep (orgs, persons, events, initiatives, inbox, dashboard). It awaits `createClient()` from `lib/supabase/server.ts`, runs parallel `fetchAll` calls, and passes serialized props down.
- `app/admin/<section>/<section>-table-client.tsx` (or `-list-client.tsx`) is the corresponding **client component** that owns interactive state, filters, and selection.
- The shell (`admin-shell.tsx`) and `<QueryProvider>` mount once at `app/admin/layout.tsx`.
- Some pages are 100% client (`/admin/lists`, `/admin/settings`, `/admin/uploads`) — these own their data fetching directly. They predate the React Query convention and have **not** been migrated.
- The Suspense wrapper at `/admin/enrichment/page.tsx` only exists to support `useSearchParams` inside the shell.

### Styling conventions

- Always compose Tailwind via `cn()` from `lib/utils.ts:1-7` (`twMerge` + `clsx`).
- Use bracketed CSS-var classes (`text-[var(--text-muted)]`), not arbitrary HEX literals.
- `font-[family-name:var(--font-heading)]` for headings; defaults handle body.
- Borders almost always use `border-[var(--glass-border)]` or `border-white/[0.04..0.10]`.
- Hover backgrounds: `hover:bg-white/[0.04]` is the dominant idiom.

### Icons

- Always import from `lucide-react`.
- Pass icons as components (`icon: LucideIcon`), not as ReactNode children, when a primitive accepts an icon prop (see `<GlassInput icon={Search}>`, `<StatCard icon={Users}>`).
- Icon sizes: 14 px (`h-3.5 w-3.5`) for compact UI, 16 px (`h-4 w-4`) for inputs and most chrome, 18 px for nav, 20 px (`h-5 w-5`) for headers and big affordances.

### Image rules — `PERFORMANCE.md` §5

- Always use `next/image` with explicit `width` and `height`.
- No raw `<img>` tags found in `app/admin/**`. Confirmed.
- External hosts allowed via `next.config.ts`'s `images.remotePatterns: [{ protocol: "https", hostname: "**" }]` — wildcard, so any HTTPS host loads.
- For null image URLs, use a fallback initials div (see `org-table-row.tsx`'s avatar fallback).

### Keys

- Always use stable unique IDs. Confirmed by `PERFORMANCE.md` §6 and observed throughout. No `key={index}` instances detected in admin row code.

---

## Anti-patterns observed

These are present in the codebase and should not be repeated.

### 1. `GlassCheckbox` duplicated inline (six places)

See [admin-ui.md → Selection model](./admin-ui.md#selection-model). The component is conceptually "shared" but physically copy-pasted. Promote to `components/ui/glass-checkbox.tsx`.

### 2. HTML `<table>` in detail sub-grids

The major admin list pages (sequences, events, organizations, persons, pipeline, enrichment) all migrated to `<DataTable>` in 2026-04. Two HTML-table holdouts remain, both intentional:

- `app/admin/organizations/[id]/page.tsx` (org detail) uses HTML `<table>` for small sub-grids (signals, people roster, events, initiatives). Acceptable: each is tiny and never warrants virtualization, but worth migrating for consistency if the surrounding page is ever rewritten.
- `app/admin/sequences/[id]/messages/message-queue-client.tsx` keeps HTML `<table>` because each row has an expandable detail row (`<td colSpan>`), which doesn't fit `DataTable`'s fixed-height virtualization. The table has `table-fixed` + `<colgroup>` to lock column widths.

### 3. Pages bypassing React Query

`app/admin/lists/page.tsx` (994 LOC) and `app/admin/settings/page.tsx` (928 LOC) fetch data via `createClient()` + `useState`/`useEffect`. `PERFORMANCE.md` §1 says: "All client-side data fetching goes through React Query hooks in `lib/queries/`. No exceptions." Both files predate the rule and have not been migrated.

### 4. Files exceeding 300 LOC

The shell-pattern guidance says client components should stay under 300 LOC. Confirmed offenders:

| File | LOC |
|---|---|
| `app/admin/enrichment/enrichment-shell.tsx` | 988 |
| `app/admin/lists/page.tsx` | 994 |
| `app/admin/settings/page.tsx` | 928 |
| `app/admin/persons/persons-table-client.tsx` | 898 |
| `app/admin/organizations/organizations-table-client.tsx` | 661 |
| `app/admin/sequences/sequence-list-client.tsx` | 417 |

The enrichment shell is the most complex and is the case study cited by `PERFORMANCE.md` §3 — it _is_ decomposed into `center-panel`, `config-panel`, `job-history`, etc., but the shell itself still owns ~1000 lines of orchestration. Lists and Settings are not decomposed at all.

### 5. Duplicated component file

`components/admin/add-to-list-dropdown.tsx` and `app/admin/persons/[id]/add-to-list-dropdown.tsx` are two separate implementations. Pick one and import it everywhere.

### 6. Search hint is non-functional

`<Header>` (`header.tsx:75-89`) renders a search button with a `/` keyboard hint. The hint suggests a global search; nothing is wired up. Either implement the cmd-k modal or remove the affordance.

---

## Adding a new component — checklist

1. Decide ui vs admin vs inline (see "When to add" above).
2. If used in a virtualized table row: wrap in `React.memo` with a custom comparator. Compare by identity for object props, value for primitives.
3. If consumed by `<AdminShell>` or any memo'd parent: pass callbacks via `useCallback`.
4. Use Tailwind utility classes; compose with `cn()`. Pull colors from CSS variables.
5. If presenting a status pill, use `<Badge variant="...">` — extend the `variants` map (`badge.tsx:3-39`) rather than custom-coloring inline.
6. If using lucide icons, pass them as components (the `LucideIcon` type) when the receiver accepts an `icon` prop.
7. Run `wc -l <file>` — if you're past 300 LOC and it's not the enrichment shell, split it.
