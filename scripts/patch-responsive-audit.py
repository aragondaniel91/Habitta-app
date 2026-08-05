from pathlib import Path


def once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Marker not found: {label}")
    return text.replace(old, new, 1)


styles_path = Path("apps/web/src/styles.css")
styles = styles_path.read_text()
styles = once(
    styles,
    """html,
body,
#root {
  min-width: 320px;
  min-height: 100%;
}

body {
  margin: 0;
  background: var(--background);
  color: var(--text);
}
""",
    """html,
body,
#root {
  width: 100%;
  min-width: 320px;
  min-height: 100%;
}

body {
  margin: 0;
  overflow-x: hidden;
  background: var(--background);
  color: var(--text);
}
""",
    "root sizing",
)
styles = once(
    styles,
    """.app-shell {
  display: grid;
  min-height: 100vh;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  background: var(--background);
  transition: grid-template-columns 180ms ease;
}
""",
    """.app-shell {
  display: grid;
  width: 100%;
  min-width: 0;
  min-height: 100vh;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  overflow-x: clip;
  background: var(--background);
  transition: grid-template-columns 180ms ease;
}
""",
    "app shell sizing",
)
styles = once(
    styles,
    """.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem 0.75rem;
}
""",
    """.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem 0.75rem;
  scrollbar-color: rgb(255 255 255 / 0.24) transparent;
  scrollbar-width: thin;
}

.sidebar-nav::-webkit-scrollbar {
  width: 6px;
}

.sidebar-nav::-webkit-scrollbar-track {
  background: transparent;
}

.sidebar-nav::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgb(255 255 255 / 0.24);
}
""",
    "sidebar scrollbar",
)
styles = once(
    styles,
    """.shell-body {
  min-width: 0;
}
""",
    """.shell-body {
  width: 100%;
  min-width: 0;
  overflow-x: clip;
}
""",
    "shell body sizing",
)
styles = once(
    styles,
    """.topbar {
  position: sticky;
  z-index: 20;
  top: 0;
  display: flex;
  min-height: var(--topbar-height);
""",
    """.topbar {
  position: sticky;
  z-index: 20;
  top: 0;
  display: flex;
  min-width: 0;
  min-height: var(--topbar-height);
""",
    "topbar sizing",
)
styles = once(
    styles,
    """.topbar__start,
.topbar__actions {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
}
""",
    """.topbar__start,
.topbar__actions {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
}

.topbar__start {
  flex: 1 1 auto;
}

.topbar__actions {
  flex: 0 0 auto;
}
""",
    "topbar flex behavior",
)
styles = once(
    styles,
    """.condo-switcher {
  display: grid;
  min-width: min(360px, 42vw);
  grid-template-columns: auto minmax(180px, 1fr);
  align-items: center;
  gap: 0.75rem;
}

.condo-switcher > span {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.055em;
  text-transform: uppercase;
}

.condo-switcher .select {
  min-height: 40px;
  border-color: transparent;
  background: #f0f2f5;
  font-size: 0.875rem;
  font-weight: 700;
}
""",
    """.condo-switcher {
  display: flex;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  gap: 0.75rem;
}

.condo-switcher > div {
  display: grid;
  min-width: 0;
  gap: 0.2rem;
}

.condo-switcher > div > span {
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.055em;
  text-transform: uppercase;
}

.condo-switcher .select {
  width: clamp(210px, 24vw, 320px);
  min-height: 40px;
  border-color: transparent;
  background: #f0f2f5;
  font-size: 0.875rem;
  font-weight: 700;
}

.condo-switcher__add {
  flex: 0 0 auto;
  white-space: nowrap;
}
""",
    "condominium switcher",
)
styles = once(
    styles,
    """.main-content {
  width: 100%;
  max-width: 1540px;
  margin: 0 auto;
  padding: clamp(1.5rem, 3vw, 2.5rem);
}
""",
    """.main-content {
  container: page / inline-size;
  width: 100%;
  min-width: 0;
  max-width: 1540px;
  margin: 0 auto;
  padding: clamp(1.5rem, 3vw, 2.5rem);
}
""",
    "main content container",
)

responsive_shell = """@media (max-width: 1180px) {
  .app-shell,
  .app-shell--collapsed {
    grid-template-columns: minmax(0, 1fr);
  }

  .sidebar {
    display: none;
  }

  .mobile-menu-button {
    display: inline-grid;
  }

  .mobile-backdrop {
    position: fixed;
    z-index: 69;
    inset: 0;
    display: block;
    visibility: hidden;
    border: 0;
    background: rgb(13 27 42 / 0.54);
    opacity: 0;
    transition:
      opacity 180ms ease,
      visibility 180ms ease;
  }

  .mobile-backdrop.is-open {
    visibility: visible;
    opacity: 1;
  }

  .mobile-drawer {
    position: fixed;
    z-index: 70;
    inset: 0 auto 0 0;
    display: flex;
    width: min(310px, calc(100vw - 44px));
    flex-direction: column;
    overflow: hidden;
    background: var(--navy);
    color: #fff;
    transform: translateX(-102%);
    transition: transform 180ms ease;
  }

  .mobile-drawer.is-open {
    transform: translateX(0);
  }

  .mobile-drawer .sidebar-nav {
    flex: 1;
  }
}

"""
responsive_marker = "@media (max-width: 960px) {"
if responsive_shell.strip() not in styles:
    styles = once(
        styles,
        responsive_marker,
        responsive_shell + responsive_marker,
        "responsive shell insertion",
    )

styles = styles.replace(
    ".condo-switcher > span {\n    display: none;",
    ".condo-switcher > div > span {\n    display: none;",
    1,
)
styles = once(
    styles,
    """  .condo-switcher {
    min-width: 0;
    grid-template-columns: minmax(0, 1fr);
  }

  .condo-switcher > div > span {
    display: none;
  }

  .condo-switcher .select {
    width: min(46vw, 220px);
    font-size: 0.78rem;
  }
""",
    """  .condo-switcher {
    min-width: 0;
    flex: 1 1 auto;
  }

  .condo-switcher > div {
    flex: 1 1 auto;
  }

  .condo-switcher > div > span {
    display: none;
  }

  .condo-switcher .select {
    width: min(46vw, 220px);
    max-width: 100%;
    font-size: 0.78rem;
  }

  .condo-switcher__add {
    display: none;
  }
""",
    "mobile condominium switcher",
)
styles_path.write_text(styles)

expenses_path = Path("apps/web/src/expenses.css")
expenses = expenses_path.read_text()
expenses = once(
    expenses,
    """.expenses-overview,
.expenses-toolbar,
.expenses-currency-strip,
.expenses-metric__top,
.expenses-detail__amount,
.expenses-drawer__header,
.expenses-form__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
""",
    """.expenses-overview,
.expenses-toolbar,
.expenses-currency-strip,
.expenses-metric__top,
.expenses-detail__amount,
.expenses-drawer__header,
.expenses-form__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.expenses-overview,
.expenses-toolbar {
  flex-wrap: wrap;
}
""",
    "expenses wrapping",
)
expenses = once(
    expenses,
    """.expenses-search {
  flex: 1 1 320px;
}
.expenses-toolbar .select {
  min-width: 190px;
}
""",
    """.expenses-search {
  min-width: min(280px, 100%);
  flex: 1 1 320px;
}
.expenses-toolbar .select {
  min-width: min(190px, 100%);
  flex: 1 1 190px;
}
""",
    "expenses toolbar",
)
expense_containers = """@container page (max-width: 1120px) {
  .expenses-metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .expenses-search {
    flex-basis: 100%;
  }
}

@container page (max-width: 760px) {
  .expenses-overview,
  .expenses-currency-strip {
    align-items: stretch;
    flex-direction: column;
  }

  .expenses-overview__actions {
    width: 100%;
  }

  .expenses-overview__actions .button {
    flex: 1;
  }

  .expenses-metrics-grid,
  .expenses-form-grid,
  .expenses-form-grid--three,
  .expenses-detail-list {
    grid-template-columns: 1fr;
  }

  .expenses-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .expenses-toolbar .select {
    width: 100%;
  }
}

"""
expense_marker = "@media (max-width: 1080px) {"
if expense_containers.strip() not in expenses:
    expenses = once(
        expenses,
        expense_marker,
        expense_containers + expense_marker,
        "expenses containers",
    )
expenses_path.write_text(expenses)

governance_path = Path("apps/web/src/governance.css")
governance = governance_path.read_text()
governance = once(
    governance,
    """.governance-overview,
.governance-metric__top,
.governance-toolbar,
.governance-drawer__header,
.governance-section-heading,
.governance-card__heading,
.governance-card__footer,
.governance-form__actions,
.governance-detail__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
""",
    """.governance-overview,
.governance-metric__top,
.governance-toolbar,
.governance-drawer__header,
.governance-section-heading,
.governance-card__heading,
.governance-card__footer,
.governance-form__actions,
.governance-detail__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.governance-overview,
.governance-toolbar {
  flex-wrap: wrap;
}
""",
    "governance wrapping",
)
governance = once(
    governance,
    """.governance-search {
  flex: 1 1 320px;
}
.governance-toolbar .select {
  min-width: 190px;
}
""",
    """.governance-search {
  min-width: min(280px, 100%);
  flex: 1 1 320px;
}
.governance-toolbar .select {
  min-width: min(190px, 100%);
  flex: 1 1 190px;
}
""",
    "governance toolbar",
)
governance_containers = """@container page (max-width: 1120px) {
  .governance-metrics-grid,
  .governance-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .governance-search {
    flex-basis: 100%;
  }
}

@container page (max-width: 760px) {
  .governance-overview {
    align-items: stretch;
    flex-direction: column;
  }

  .governance-overview .button {
    width: 100%;
  }

  .governance-metrics-grid,
  .governance-card-grid,
  .governance-form-grid,
  .governance-form-grid--three,
  .governance-detail__summary dl {
    grid-template-columns: 1fr;
  }

  .governance-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .governance-toolbar .select {
    width: 100%;
  }
}

"""
governance_marker = "@media (max-width: 1120px) {"
if governance_containers.strip() not in governance:
    governance = once(
        governance,
        governance_marker,
        governance_containers + governance_marker,
        "governance containers",
    )
governance_path.write_text(governance)
