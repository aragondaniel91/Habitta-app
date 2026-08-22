import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

describe('HAB-264 approved UX primitives', () => {
  it('keeps the new drawer contract opt-in so legacy modules do not change implicitly', async () => {
    const drawer = await read('./components/Drawer.tsx');

    expect(drawer).toContain("presentation?: 'legacy' | 'workspace'");
    expect(drawer).toContain("presentation = 'legacy'");
    expect(drawer).toContain("const workspace = presentation === 'workspace'");
    expect(drawer).toContain("workspace ? 'ux-drawer-panel' : ''");
    expect(drawer).toContain('description?: ReactNode');
    expect(drawer).toContain('className="ux-drawer-panel__description"');
  });

  it('adds reusable card form sections without changing the plain default', async () => {
    const layout = await read('./components/FormLayout.tsx');

    expect(layout).toContain("variant?: 'plain' | 'card'");
    expect(layout).toContain("variant = 'plain'");
    expect(layout).toContain('data-variant={variant}');
  });

  it('gives fields explicit invalid and required presentation hooks', async () => {
    const ui = await read('./components/ui.tsx');

    expect(ui).toContain('required = false');
    expect(ui).toContain("data-invalid={Boolean(error) || undefined}");
    expect(ui).toContain('className="field__required"');
    expect(ui).toContain('role="alert"');
  });

  it('ships a shared workspace language for metrics, sections, tabs and notices', async () => {
    const workspace = await read('./components/WorkspaceUi.tsx');

    expect(workspace).toContain('export function WorkspaceMetrics');
    expect(workspace).toContain('export function WorkspaceMetricCard');
    expect(workspace).toContain('export function WorkspaceSection');
    expect(workspace).toContain('export function WorkspaceTabs');
    expect(workspace).toContain('export function WorkspaceTab');
    expect(workspace).toContain('export function InlineNotice');
  });

  it('locks matching control heights, inline errors, workspace drawers and mobile collapse in CSS', async () => {
    const css = await read('./ux-contract.css');
    const main = await read('./main.tsx');

    expect(css).toContain('--ux-control-height: 48px');
    expect(css).toContain(".ux-form .field[data-invalid='true'] .input");
    expect(css).toContain(".ux-drawer-panel[data-presentation='workspace']");
    expect(css).toContain(".ux-form .form-grid[data-columns='3']");
    expect(css).toContain('.ux-metrics');
    expect(main).toContain("import './ux-contract.css';");
  });
});
