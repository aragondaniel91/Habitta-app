import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = () => readFile(new URL('./pages/TeamAccessPage.tsx', import.meta.url), 'utf8');

describe('administrator invitation email UX', () => {
  it('tells the administrator that production sends a real transactional email', async () => {
    const page = await source();

    expect(page).toContain('En producción, al enviar esta invitación');
    expect(page).toContain('correo transaccional real');
    expect(page).toContain('independiente de los correos automáticos');
    expect(page).toContain('Crear y enviar invitación');
  });
});
