# HAB-429 — Habitta Premium HQ Design System

This document is the implementation contract for the approved Habitta visual direction. It is intentionally additive: the first slice introduces shared semantic foundations and proves them on the Resident Dashboard without changing authorization, RLS, financial semantics, or tenant behavior.

## Product direction

Habitta should feel like a premium residential operations product, not a generic admin template.

- Deep navy provides the application shell and primary hierarchy.
- Green is restrained and semantic: success, positive state, and selected brand accents rather than decoration everywhere.
- Blue/teal support information hierarchy and data visualization.
- Main working surfaces stay light, calm, and high-contrast.
- Borders and shadows are subtle; depth should come from spacing and hierarchy before effects.
- Resident experiences are calmer and more consumer-oriented than administrator surfaces.
- Platform Admin may become denser operationally, but must still share the same tokens and interaction language.

## Typography

- Headings / display: Poppins direction.
- UI, controls, tables, labels, body and numerical data: Inter/system-sans direction.
- Monetary values use tabular numerals where available.
- Headings should be compact and confident; avoid oversized marketing typography inside the authenticated product.

## Semantic token layer

The implementation should expose semantic aliases rather than forcing feature code to know raw brand values.

### Color

- `--hq-shell`: deep navy application chrome.
- `--hq-shell-elevated`: slightly lighter navy for selected/raised shell surfaces.
- `--hq-canvas`: neutral application background.
- `--hq-surface`: primary card/dialog surface.
- `--hq-surface-subtle`: secondary grouped surface.
- `--hq-ink`: primary text.
- `--hq-muted`: secondary text.
- `--hq-line`: standard separator/border.
- `--hq-brand`: Habitta green.
- `--hq-info`: blue/teal informational emphasis.
- `--hq-danger`, `--hq-warning`, `--hq-success`: semantic states only.

### Spacing

Use a 4px rhythm. Common spacing should resolve to 4, 8, 12, 16, 20, 24, 32 and 40px rather than one-off values.

### Control heights

- Compact operational control: 36px.
- Standard product control: 42–44px.
- Touch/mobile primary actions: at least 44px.

### Radius

Use a restrained family rather than unrelated radii:

- small: 8px
- control: 10–12px
- card: 14–16px
- large composition / drawer: 18–20px

### Elevation

Prefer border + canvas contrast. Shadows should be reserved for floating surfaces, drawers, menus, selected emphasis and hero financial cards.

## Shared components

The first implementation slice should establish reusable conventions for:

- Button: primary, secondary, quiet/destructive as required.
- Input / Select: same height, border, radius, focus treatment and label rhythm.
- Badge: semantic state, never decoration-only.
- Surface / Card: shared border, radius and padding rules.
- Table: consistent header, row density, numeric alignment and responsive fallback.
- Drawer / Modal: intentional hierarchy, clear close affordance, predictable action footer.
- Empty / Loading / Error: compact, useful and action-oriented rather than oversized illustration states.

## Navigation

### Desktop

A persistent deep-navy sidebar is the approved direction for authenticated desktop surfaces. It must make the active area obvious without relying on color alone and keep account/workspace context legible.

### Mobile

Mobile is a first-class product surface. Resident navigation should move toward an intentional bottom-navigation pattern where it improves reachability; desktop sidebars should not simply collapse into tiny desktop chrome.

## Resident Dashboard reference hierarchy

The Resident Dashboard is the reference surface for this first slice. Preserve all authoritative HAB-417/HAB-418/HAB-427 behavior while presenting information in this order:

1. Greeting and current residential context.
2. Authoritative balance by currency.
3. Next obligation / due signal.
4. Recent financial status and actions.
5. `Mis propiedades` only when the resident has multiple financial units.
6. Recent payments/activity.
7. Compact community/request/voting signals as supporting information.

The design must not merge currencies, recompute balances client-side, expose UUIDs, or imply actions that backend/RLS does not authorize.

## Platform Admin density contract

Platform Admin is not part of the first implementation slice, but future adoption should use denser tables, filters and operational controls while preserving the same token system, type hierarchy, focus behavior and semantic states.

## Responsive bands

- Desktop: persistent navigation, multi-column dashboard composition where useful.
- Tablet: reduce decorative side content first; preserve information hierarchy and readable controls.
- Mobile: one primary column, touch-safe actions, no horizontal page scrolling, financial context before secondary community content.

## Accessibility

- Visible `:focus-visible` treatment on every interactive control.
- WCAG-conscious foreground/background contrast.
- State is never color-only.
- Minimum 44px touch targets for mobile primary interactions.
- Dialog/drawer semantics and keyboard behavior preserved.
- Reduced-motion preferences respected for nonessential transitions.

## Financial and security guardrails

Visual work must not:

- widen RLS or client permissions;
- place service-role credentials in browser code;
- recompute ledger balances client-side;
- combine different currencies into one amount;
- expose UUIDs as user-facing identifiers;
- mutate posted financial history;
- weaken HAB-417 resident payment semantics;
- weaken HAB-418 family/authorized-occupant access semantics;
- weaken HAB-427 multi-unit financial-unit filtering.

## First PR scope

### Included

1. Shared semantic HQ token aliases and a small reusable component foundation under `apps/web`.
2. Resident Dashboard reference adoption using those foundations.
3. Responsive behavior for desktop, tablet and 390px-class mobile widths.
4. Tests that prove preserved resident routing/financial semantics and structural design contracts.

### Excluded

- Full application redesign.
- Platform Admin 2.0.
- Public marketing site changes.
- API, Worker, Supabase or RLS changes.
- New financial calculations or authorization behavior.

Visual acceptance requires screenshots at desktop, tablet and mobile widths before this issue can be considered fully complete.
