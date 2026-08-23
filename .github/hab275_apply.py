from pathlib import Path
import re

ROOT = Path('.')

def read(path: str) -> str:
    return (ROOT / path).read_text()

def write(path: str, value: str) -> None:
    (ROOT / path).write_text(value)

def replace_once(value: str, old: str, new: str, label: str) -> str:
    assert value.count(old) == 1, f'{label}: expected 1, found {value.count(old)}'
    return value.replace(old, new, 1)

# Governance proposal form.
path = 'apps/web/src/pages/GovernancePage.tsx'
source = read(path)
original = source
anchor = "import { Drawer } from '../components/Drawer';\n"
source = replace_once(
    source,
    anchor,
    anchor + "import { FormActions, FormGrid } from '../components/FormLayout';\n",
    'Governance FormLayout import',
)
grid = re.compile(
    r'(?P<indent>^[ \t]*)<div className="governance-form-grid(?P<three> governance-form-grid--three)?">\n(?P<body>.*?)(?P=indent)</div>',
    re.MULTILINE | re.DOTALL,
)
matches = list(grid.finditer(source))
assert len(matches) == 2 and sum(bool(m.group('three')) for m in matches) == 1
source = grid.sub(
    lambda m: f"{m.group('indent')}{'<FormGrid columns={3}>' if m.group('three') else '<FormGrid>'}\n{m.group('body')}{m.group('indent')}</FormGrid>",
    source,
)
actions = re.compile(
    r'(?P<indent>^[ \t]*)<div className="governance-form__actions">\n(?P<body>.*?)(?P=indent)</div>',
    re.MULTILINE | re.DOTALL,
)
assert len(list(actions.finditer(source))) == 1
source = actions.sub(
    lambda m: f"{m.group('indent')}<FormActions>\n{m.group('body')}{m.group('indent')}</FormActions>",
    source,
)
for invariant in [
    'budgetAmount: budgetAmount || undefined',
    'currencyCode: budgetAmount ? currencyCode : undefined',
    'quorumPercentage: Number(quorumPercentage)',
    'closesAt: new Date(closesAt).toISOString()',
    'nextGovernanceActions',
    'governance-detail__actions',
]:
    assert invariant in original and invariant in source, invariant
assert 'governance-form-grid' not in source and 'governance-form__actions' not in source
write(path, source)

# Voting rules fields.
path = 'apps/web/src/features/governance/GovernanceVotingRulesPanel.tsx'
source = read(path)
original = source
anchor = "import { Button, Field, Surface } from '../../components/ui';\n"
source = replace_once(
    source,
    anchor,
    anchor + "import { FormGrid } from '../../components/FormLayout';\n",
    'Voting rules FormGrid import',
)
pattern = re.compile(
    r'(?P<indent>^[ \t]*)<div className="governance-voting-rule__fields">\n(?P<body>.*?)(?P=indent)</div>',
    re.MULTILINE | re.DOTALL,
)
assert len(list(pattern.finditer(source))) == 1
source = pattern.sub(
    lambda m: f"{m.group('indent')}<FormGrid>\n{m.group('body')}{m.group('indent')}</FormGrid>",
    source,
)
for invariant in [
    "editable = manage && proposal.status === 'draft'",
    'quorumPercentage: Number(values.quorum)',
    'approvalThresholdPercentage: Number(values.threshold)',
    'expectedVersion: proposal.version',
]:
    assert invariant in original and invariant in source, invariant
assert 'governance-voting-rule__fields' not in source
write(path, source)

# New Assembly drawer only; lifecycle/detail controls stay local.
path = 'apps/web/src/features/governance/AssembliesWorkspace.tsx'
source = read(path)
original = source
anchor = "import { Drawer } from '../../components/Drawer';\n"
source = replace_once(
    source,
    anchor,
    anchor + "import { FormActions, FormGrid } from '../../components/FormLayout';\n",
    'Assemblies FormLayout import',
)
pattern = re.compile(
    r'(?P<indent>^[ \t]*)<div className="assemblies-form__grid">\n(?P<body>.*?)(?P=indent)</div>',
    re.MULTILINE | re.DOTALL,
)
assert len(list(pattern.finditer(source))) == 2
source = pattern.sub(
    lambda m: f"{m.group('indent')}<FormGrid>\n{m.group('body')}{m.group('indent')}</FormGrid>",
    source,
)
old = """        <Button disabled={saving || title.trim().length < 2} type="submit">
          {saving ? 'Creando…' : 'Crear borrador'}
        </Button>"""
new = """        <FormActions>
          <Button disabled={saving || title.trim().length < 2} type="submit">
            {saving ? 'Creando…' : 'Crear borrador'}
          </Button>
        </FormActions>"""
source = replace_once(source, old, new, 'Create Assembly submit button')
for invariant in [
    "body: JSON.stringify({ action, expectedVersion: selected.version })",
    'body: JSON.stringify({ minutes, expectedVersion: selected.version })',
    'votingBasis: basis',
    'quorumPercentage: Number(quorum)',
    'scheduledAt: new Date(scheduledAt).toISOString()',
    'Iniciar y congelar elegibilidad',
    '/minutes/publish',
]:
    assert invariant in original and invariant in source, invariant
assert 'assemblies-form__grid' not in source and 'className="assemblies-actions"' in source
write(path, source)

# Action Item editor.
path = 'apps/web/src/features/governance/AssemblyActionItemsWorkspace.tsx'
source = read(path)
original = source
anchor = "import { Drawer } from '../../components/Drawer';\n"
source = replace_once(
    source,
    anchor,
    anchor + "import { FormActions, FormGrid } from '../../components/FormLayout';\n",
    'Action Items FormLayout import',
)
pattern = re.compile(
    r'(?P<indent>^[ \t]*)<div className="action-items-form__grid">\n(?P<body>.*?)(?P=indent)</div>',
    re.MULTILINE | re.DOTALL,
)
assert len(list(pattern.finditer(source))) == 1
source = pattern.sub(
    lambda m: f"{m.group('indent')}<FormGrid>\n{m.group('body')}{m.group('indent')}</FormGrid>",
    source,
)
pattern = re.compile(
    r'(?P<indent>^[ \t]*)<div className="action-items-form__actions">\n(?P<body>.*?)(?P=indent)</div>',
    re.MULTILINE | re.DOTALL,
)
assert len(list(pattern.finditer(source))) == 1
source = pattern.sub(
    lambda m: f"{m.group('indent')}<FormActions>\n{m.group('body')}{m.group('indent')}</FormActions>",
    source,
)
for invariant in [
    'resolutionId: draft.resolutionId || null',
    'assigneeUserId: draft.assigneeUserId || null',
    'serviceRequestId: draft.serviceRequestId || null',
    'maintenanceWorkOrderId: draft.maintenanceWorkOrderId || null',
    'expectedVersion: editor.item.version',
    'expectedVersion: item.version',
]:
    assert invariant in original and invariant in source, invariant
assert 'action-items-form__grid' not in source and 'action-items-form__actions' not in source
assert 'action-item-card__actions' in source
write(path, source)

# Governance proposal CSS.
path = 'apps/web/src/governance.css'
css = read(path)
css = replace_once(css, '.governance-form__actions,\n', '', 'governance action selector')
css, n = re.subn(
    r'\.governance-form-grid \{\n.*?\n\}\n\.governance-form-grid--three \{\n.*?\n\}\n',
    '', css, count=1, flags=re.DOTALL,
)
assert n == 1
css, n = re.subn(r'\.governance-form__actions \{\n.*?\n\}\n', '', css, count=1, flags=re.DOTALL)
assert n == 1
pair = '  .governance-form-grid,\n  .governance-form-grid--three,\n'
assert css.count(pair) == 2
css = css.replace(pair, '')
assert 'governance-form-grid' not in css and 'governance-form__actions' not in css
assert '.governance-detail__actions {' in css
write(path, css)

# Voting rules CSS.
path = 'apps/web/src/features/governance/governance-voting-rules-panel.css'
css = read(path)
desktop = """.governance-voting-rule__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
}

"""
mobile = """  .governance-voting-rule__fields {
    grid-template-columns: 1fr;
  }

"""
css = replace_once(css, desktop, '', 'voting rule desktop grid')
css = replace_once(css, mobile, '', 'voting rule mobile grid')
assert 'governance-voting-rule__fields' not in css
write(path, css)

# Assembly CSS: inline agenda keeps its local grid.
path = 'apps/web/src/features/governance/assemblies-workspace.css'
css = read(path)
css = replace_once(css, '.assemblies-form__grid,\n.assemblies-inline-form {', '.assemblies-inline-form {', 'assembly grid selector')
css = replace_once(css, '  .assemblies-form__grid,\n', '', 'assembly responsive grid selector')
assert 'assemblies-form__grid' not in css and '.assemblies-inline-form {' in css
write(path, css)

# Action Item CSS: card actions stay local.
path = 'apps/web/src/features/governance/assembly-action-items-workspace.css'
css = read(path)
css = replace_once(
    css,
    '.action-item-card__links,\n.action-item-card__actions,\n.action-items-form__actions {',
    '.action-item-card__links,\n.action-item-card__actions {',
    'action item action selector',
)
css, n = re.subn(r'\.action-items-form__grid \{\n.*?\n\}\n\n', '', css, count=1, flags=re.DOTALL)
assert n == 1
css = replace_once(css, '  .action-items-form__grid,\n', '', 'action item responsive grid selector')
css = replace_once(
    css,
    '  .action-item-card__actions > button,\n  .action-items-form__actions > button {',
    '  .action-item-card__actions > button,\n  .action-items-form .form-actions > button {',
    'action item responsive action selector',
)
assert 'action-items-form__grid' not in css and 'action-items-form__actions' not in css
write(path, css)

# Parity matrix.
path = 'docs/frontend/form-parity-matrix.md'
matrix = read(path)
old = '| Gobernanza | GovernancePage formularios | deferred | Parcial | Parcial | No | No | Pendiente de prueba específica | No encontrado | Sólo auditoría | Pendiente de alcance separado. |'
new = '| Gobernanza | Propuestas, reglas de votación, asambleas y acuerdos | compliant | Sí | Sí | Sí | Sí | FormGrid compartido 2/3→1 y FormActions en editores principales | No encontrado | Completada | Conserva quórum/threshold, optimistic versioning, snapshots de elegibilidad, publicaciones e IDs operativos. |'
matrix = replace_once(matrix, old, new, 'Governance parity row')
write(path, matrix)
