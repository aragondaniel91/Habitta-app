import { isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '../../navigation';
import { MODULE_HELP } from './module-help';
import { HelpCenterPage, resolveModuleHelpTopic } from './HelpCenterPage';

function textFrom(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textFrom).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textFrom(node.props.children);
  return '';
}

function findButton(node: ReactNode, label: string): { onClick?: () => void } | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findButton(child, label);
      if (match) return match;
    }
    return undefined;
  }
  if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node)) return undefined;
  if (node.type === 'button' && textFrom(node.props.children) === label) {
    return node.props as { onClick?: () => void };
  }
  return findButton(node.props.children, label);
}

describe('HelpCenterPage', () => {
  it('keeps APP_ROUTES and MODULE_HELP in a one-to-one topic mapping', () => {
    const topicIds = APP_ROUTES.map((route) => resolveModuleHelpTopic(MODULE_HELP[route.key].topicId));

    expect(topicIds.map(({ route }) => route.key).sort()).toEqual(
      APP_ROUTES.map((route) => route.key).sort(),
    );
    expect(new Set(topicIds.map(({ content }) => content.topicId)).size).toBe(APP_ROUTES.length);
  });

  it('uses adapted rather than raw team and settings guidance', () => {
    const team = resolveModuleHelpTopic('module-help.team').content;
    const settings = resolveModuleHelpTopic('module-help.settings').content;

    expect(team.steps.join(' ')).toContain('Quitar acceso');
    expect(team.steps.join(' ')).not.toContain('Retirar/Eliminar acceso');
    expect(settings.actions.join(' ')).toContain('Zona de peligro');
    expect(settings.beforeConfirm.join(' ')).toContain('irreversible');
    expect(settings.permissions).toContain('propietario de la organización');
  });

  it('renders canonical Administrator and Resident guide content with all guide sections', () => {
    const administrator = resolveModuleHelpTopic('module-help.team');
    const resident = resolveModuleHelpTopic('module-help.requests');
    const administratorPage = renderToStaticMarkup(
      <HelpCenterPage topicId={administrator.content.topicId} onBack={vi.fn()} />,
    );
    const residentPage = renderToStaticMarkup(
      <HelpCenterPage topicId={resident.content.topicId} onBack={vi.fn()} />,
    );

    expect(administratorPage).toContain(administrator.route.title);
    expect(administratorPage).toContain(administrator.content.purpose);
    expect(residentPage).toContain(resident.route.label);
    for (const heading of [
      'Qué puedes hacer',
      'Paso a paso',
      'Antes de confirmar',
      'Qué debe pasar después',
      'Si algo no sale como esperas',
      'Recomendaciones',
      'Permisos',
    ]) {
      expect(administratorPage).toContain(heading);
    }
  });

  it('wires both rendered Back and Volver controls to onBack without child-index assumptions', () => {
    const onBack = vi.fn();
    const page = HelpCenterPage({ topicId: 'module-help.dashboard', onBack });
    const back = findButton(page, 'Back');
    const volver = findButton(page, 'Volver');

    expect(back?.onClick).toBeTypeOf('function');
    expect(volver?.onClick).toBeTypeOf('function');
    back?.onClick?.();
    volver?.onClick?.();
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});
