from pathlib import Path
import re

page_path = Path('apps/web/src/pages/BudgetsPage.tsx')
css_path = Path('apps/web/src/budgets.css')
matrix_path = Path('docs/frontend/form-parity-matrix.md')


def replace_once(value: str, old: str, new: str, label: str) -> str:
    count = value.count(old)
    assert count == 1, f'{label}: expected 1, found {count}'
    return value.replace(old, new, 1)


page = page_path.read_text()
original = page

anchor = "import { Drawer } from '../components/Drawer';\n"
layout_import = "import { FormActions, FormGrid } from '../components/FormLayout';\n"
assert page.count(anchor) == 1
assert layout_import not in page
page = page.replace(anchor, anchor + layout_import, 1)

page = replace_once(
    page,
    '<div className="budgets-editor">',
    '<div className="budgets-editor ux-form">',
    'premium shared form opt-in',
)

grid_pattern = re.compile(
    r'(?P<indent>^[ \t]*)<div className="budgets-editor__grid">\n(?P<body>.*?)(?P=indent)</div>',
    re.MULTILINE | re.DOTALL,
)
matches = list(grid_pattern.finditer(page))
assert len(matches) == 1, f'period grid: expected 1, found {len(matches)}'
page = grid_pattern.sub(
    lambda match: f"{match.group('indent')}<FormGrid columns={{3}}>\n{match.group('body')}{match.group('indent')}</FormGrid>",
    page,
)

footer_pattern = re.compile(
    r'(?P<indent>^[ \t]*)<div className="budgets-editor__footer">\n(?P<body>.*?)(?P=indent)</div>',
    re.MULTILINE | re.DOTALL,
)
matches = list(footer_pattern.finditer(page))
assert len(matches) == 1, f'editor footer: expected 1, found {len(matches)}'
page = footer_pattern.sub(
    lambda match: f"{match.group('indent')}<FormActions>\n{match.group('body')}{match.group('indent')}</FormActions>",
    page,
)

for invariant in [
    'requestId: crypto.randomUUID()',
    'categoryId: line.categoryId',
    'currencyCode: line.currencyCode',
    'amount: line.amount',
    'requestId: editor.requestId',
    'revisionNote: editor.revisionNote || undefined',
    'Number(line.amount) > 0',
    'editor.endsOn >= editor.startsOn',
    "const canApprove = roles.includes('condominium_admin')",
    "action: 'submit' | 'approve'",
    '/actual-vs-budget`',
    'Nunca se consolidan monedas distintas.',
    'Sin conversión entre monedas.',
    'className="budgets-editor-line"',
]:
    assert invariant in original and invariant in page, invariant

assert 'budgets-editor__grid' not in page
assert 'budgets-editor__footer' not in page
page_path.write_text(page)

css = css_path.read_text()

css, count = re.subn(
    r'\.budgets-editor__grid \{\n.*?\n\}\n\n',
    '',
    css,
    count=1,
    flags=re.DOTALL,
)
assert count == 1, f'desktop period grid css: {count}'

css, count = re.subn(
    r'\.budgets-editor__footer \{\n.*?\n\}\n\n',
    '',
    css,
    count=1,
    flags=re.DOTALL,
)
assert count == 1, f'desktop footer css: {count}'

css = replace_once(
    css,
    "  .budgets-editor__grid {\n    grid-template-columns: 1fr;\n  }\n\n",
    '',
    'mobile period grid css',
)
css = replace_once(
    css,
    "  .budgets-editor__footer {\n    flex-direction: column-reverse;\n  }\n\n  .budgets-editor__footer .button {\n    width: 100%;\n  }\n",
    '',
    'mobile footer css',
)

assert '.budgets-editor__grid' not in css
assert '.budgets-editor__footer' not in css
assert '.budgets-editor-line {' in css
assert '.budgets-editor-line__note' in css
css_path.write_text(css)

matrix = matrix_path.read_text()
old_row = '| Presupuestos | BudgetsPage formularios | deferred | Parcial | Parcial | No | No | Pendiente de prueba específica | No encontrado | Sólo auditoría | No tocar cálculos ni aprobaciones financieras en esta fase. |'
new_row = '| Presupuestos | Editor de período y líneas financieras especializadas | compliant | Sí | Parcial | Sí | Sí | ux-form + FormGrid 3→1; líneas financieras conservan grid especializado responsive | No encontrado | Completada | Conserva requestId, categoría, moneda, monto, revisiones, aprobación y actual-vs-budget sin conversiones implícitas. |'
assert matrix.count(old_row) == 1
matrix_path.write_text(matrix.replace(old_row, new_row, 1))
