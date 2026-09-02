# HAB-429 — Habitta Premium Design System

Status: **approved design direction**

This document is the visual and interaction contract for the authenticated Habitta product surfaces. It translates the approved SaaS Premium HQ direction into implementation rules that can be consumed incrementally by `apps/web` and, where appropriate, `apps/platform-admin`.

## Product principle

Habitta should feel like one premium SaaS product, not a collection of independently styled modules.

Shared DNA does **not** mean identical density everywhere:

- Resident surfaces are calm, consumer-friendly and action-oriented.
- Condominium administration is operational and moderately dense.
- Platform Admin is executive/operational and intentionally denser.

All three share typography, spacing logic, control heights, surface language, status vocabulary, accessibility behavior and brand color semantics.

## Brand foundation

### Core visual character

- Deep navy for navigation, authority and product shell.
- Restrained green for positive/active/primary Habitta accents.
- Blue/teal for informational and supporting actions.
- Very light neutral application background.
- White primary surfaces.
- Soft borders and restrained shadows; avoid floating-card overload.
- Rounded geometry that feels modern and professional, never playful.

### Semantic color roles

Existing production color tokens remain authoritative until migrated. New work should expose semantic aliases instead of scattering literal values.

Recommended semantic roles:

- `--hq-navy`: product shell / strongest emphasis.
- `--hq-navy-elevated`: hover/selected shell state.
- `--hq-green`: Habitta positive/active accent.
- `--hq-green-soft`: success/ownership/healthy state background.
- `--hq-blue`: informational/action accent.
- `--hq-blue-soft`: informational surface.
- `--hq-bg`: application background.
- `--hq-surface`: primary white surface.
- `--hq-surface-subtle`: secondary grouping surface.
- `--hq-border`: default divider/border.
- `--hq-border-strong`: form/control border.
- `--hq-text`: default body text.
- `--hq-text-strong`: headings, money and key labels.
- `--hq-muted`: secondary copy.
- semantic success/warning/danger/info roles must map to existing status semantics, not introduce new financial meanings.

Do not use color as the only carrier of meaning.

## Typography

### Families

- Product headings: Poppins.
- UI/body/data: Inter.

Keep the existing production font stack; HAB-429 standardizes hierarchy, not branding replacement.

### Hierarchy

- Page title: strong, compact, high-contrast; avoid oversized marketing typography inside the app.
- Section title: 18–20px visual weight depending on density.
- Card/metric value: hierarchy comes from weight and whitespace, not excessive font size.
- Eyebrow/metadata: 11–12px, uppercase only when it improves scanning.
- Body: 14–16px depending on surface density.
- Table data: compact but never below accessible readability.

Money and key metrics use tabular numerals where possible.

## Spacing and density

Use a predictable 4px-based rhythm.

Suggested scale:

- 4px: micro spacing.
- 8px: tight inline spacing.
- 12px: compact grouping.
- 16px: standard component padding/gap.
- 20px: card/internal generous spacing.
- 24px: section spacing.
- 32px: major desktop section separation.
- 40–48px: page-level breathing room only when content density permits.

Avoid large vertical empty zones. Empty data should reduce layout height instead of reserving content-sized containers.

## Radii and shadows

Recommended roles:

- Small control radius: 8px.
- Standard control/card radius: 10–12px.
- Large shell/feature surface radius: 14–16px.
- Pills only for badges/chips, not general controls.

Shadows are subtle and rare:

- Default cards should rely primarily on border + contrast.
- Use small shadow for important elevated surfaces.
- Drawers/modals may use stronger elevation.
- Avoid every card looking detached from the page.

## Control contract

### Standard heights

Desktop/tablet:

- Compact control: 36px.
- Standard control: 42–44px.
- Important CTA: 44px minimum.

Touch/mobile:

- Interactive targets: minimum 44px.

Inputs, selects and equivalent buttons in the same form row must visually align to the same height.

### Buttons

Hierarchy:

1. Primary — one dominant action per surface/section.
2. Secondary — bordered neutral action.
3. Ghost — contextual low-emphasis action.
4. Danger — explicit destructive action only.

Do not repeat the same primary CTA several times inside one viewport unless there is a demonstrated usability need.

### Selectors

Context selectors (condominium, unit/property, date range) should read as workspace context, not generic form fields.

For HAB-427 multi-unit context:

- `Todas mis unidades` is first-class.
- Human-readable labels only.
- Never expose UUIDs.
- Single-unit users do not see unnecessary selectors.

## Surfaces and cards

Cards exist to group meaningful content, not to fill a grid.

### Metric cards

- Small label.
- One strong value.
- Optional short supporting line/action.
- Do not reserve large empty areas when no supporting data exists.

### Content panels

- Section heading and optional single contextual action.
- Compact rows/list/table underneath.
- Empty state should fit the same panel without becoming the dominant page element.

### Property cards

For multi-unit residents:

- Human unit/building label.
- Standing/role badge when useful.
- Balance per currency from authoritative server data.
- Next relevant obligation where available.
- One disclosure affordance to drill into unit context.

No client-side financial recomputation that contradicts ledger/RPC authority.

## Tables

- Strong column alignment.
- Numeric columns right-aligned where appropriate.
- Use tabular numerals for amounts.
- Header visually distinct but quiet.
- Avoid excessive row height.
- Status rendered through shared badge vocabulary.
- Responsive behavior defined per table: reflow, priority columns or card transformation; never horizontal chaos by accident.

## Forms

- Consistent field label, control, hint and error spacing.
- Required states must be clear without relying only on an asterisk.
- Related fields grouped under a small section header rather than multiple unrelated cards.
- Sticky footer actions only for long drawers/forms where losing the submit action is a usability problem.

## Drawers and modals

### Drawer

Preferred for operational create/edit flows that benefit from keeping page context visible.

- Clear title + concise context.
- Close control top-right.
- Logical field grouping.
- Sticky action area for long content.
- Explicit destructive actions separated from save actions.

### Modal

Use for confirmation, short decisions and narrow workflows.

Do not use large modals as substitute pages.

## Empty, loading and error states

### Empty

Premium empty states are compact:

- Small icon or status mark.
- One clear sentence.
- Optional short explanation.
- Optional single CTA.

Avoid large illustration-sized gaps for ordinary `0 results` states.

### Loading

Use skeletons shaped like the final content. Avoid spinner-only full screens after the authenticated shell is already available.

### Errors

- Explain what failed in user language.
- Preserve successfully loaded sections where possible.
- Offer retry only when retry is meaningful.
- Never leak implementation details.

## Navigation

### Desktop

- Deep navy persistent sidebar.
- Active item uses restrained Habitta green treatment.
- Group labels are secondary and compact.
- Topbar carries workspace context, notification/account controls and only necessary actions.

### Resident information architecture direction

Target mental model:

- Inicio
- Cuotas / Mi cuenta
- Pagos
- Estado de cuenta
- Mi propiedad / Mis propiedades
- Solicitudes
- Comunidad
- Documentos
- Anuncios where product policy requires it

Final availability remains capability-driven.

### Mobile resident navigation

Mobile is not a collapsed desktop sidebar.

Use a small high-frequency bottom navigation plus a `Más` destination for lower-frequency modules. Candidate high-frequency items:

- Inicio
- Cuotas / Cuenta
- Solicitudes
- Comunidad
- Más

Payments/property shortcuts may replace one candidate based on usability validation. Authorization is unchanged regardless of navigation presentation.

## Responsive strategy

Desktop primary breakpoints should preserve useful density rather than simply shrinking dimensions.

Suggested behavioral bands:

- >= 1200px: full desktop composition.
- 900–1199px: compact desktop/tablet, reduced gutters.
- 640–899px: stacked major grids, retained top context.
- < 640px: mobile-first composition, bottom navigation where adopted, full-width primary actions only when appropriate.

No fixed-width content should force horizontal page scrolling.

## Resident Dashboard reference slice

The approved target direction prioritizes:

1. Resident greeting/property context.
2. Consolidated balance by currency.
3. Next obligation.
4. Recent payment/account signal.
5. `Mis propiedades` for multi-unit owners.
6. Recent payments/activity.
7. Compact supporting community/request signals.

Single-unit resident remains deliberately simpler.

For multi-unit owners:

- Selector starts at `Todas mis unidades`.
- Property cards show each authorized financial unit.
- Selecting a unit narrows cards/activity to that unit using already-authorized server data.
- Currency totals remain separate.

## Platform Admin density contract

Platform Admin shares Habitta visual DNA but operates at a higher information density.

Expected shell behavior:

- Persistent sidebar/topbar.
- KPI strip without giant cards.
- Portfolio/customer table and actionable alerts dominate the viewport.
- Customer 360 uses compact sections/tabs rather than a long pile of cards.
- Charts only when authoritative longitudinal data exists.
- No resident-private financial ledger or unnecessary resident PII.

## Accessibility

Minimum requirements:

- WCAG-conscious contrast.
- Visible focus state.
- Keyboard navigation for all controls.
- Minimum 44px touch targets where appropriate.
- Proper labels and programmatic names.
- Semantic heading hierarchy.
- Do not hide real information behind hover-only interactions.
- Reduced-motion behavior for nonessential motion.

## Financial and authorization guardrails

HAB-429 is visual/interaction infrastructure only.

Never under a design-system change:

- widen RLS;
- introduce service-role browser calls;
- recompute authoritative balances from presentation data;
- combine currencies;
- mutate posted financial history;
- expose UUIDs;
- turn client filtering into authorization;
- alter HAB-417/HAB-418/HAB-427 role/financial contracts.

## Incremental delivery

Recommended sequence:

1. Shared semantic tokens and common primitives.
2. Resident Dashboard reference adoption.
3. Shared form/control/table/drawer cleanup.
4. Platform Admin shell/Overview adoption under HAB-430.
5. Resident Payments/Account adoption under HAB-431.
6. Remaining modules migrated incrementally, with no big-bang stylesheet rewrite.

Every PR must leave production usable and independently coherent.