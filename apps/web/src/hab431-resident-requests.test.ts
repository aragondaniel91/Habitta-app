import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canWriteResidentRequests } from './lib/roles';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const app = source('./App.tsx');
const resident = source('./pages/ResidentRequestsPage.tsx');
const administrative = source('./pages/RequestsPage.tsx');
const css = source('./resident-requests.css');

describe('HAB-431 resident Requests stays residential without widening capabilities', () => {
  it('routes pure resident sessions to a dedicated Requests surface while preserving staff', () => {
    expect(app).toContain("import('./pages/ResidentRequestsPage')");
    expect(app).toContain("activeRoute.key === 'requests'");
    expect(app).toContain('page = residentOnly ? (');
    expect(app).toContain('<ResidentRequestsPage');
    expect(app).toContain('<RequestsPage');
    expect(administrative).toContain('Gestión operativa');
    expect(administrative).toContain('assignedToUserId');
  });

  it('keeps restricted residential role combinations read-only even when tenant has extra roles', () => {
    expect(canWriteResidentRequests(['owner'])).toBe(true);
    expect(canWriteResidentRequests(['owner', 'tenant'])).toBe(true);
    expect(canWriteResidentRequests(['tenant'])).toBe(false);
    expect(canWriteResidentRequests(['tenant', 'family_member'])).toBe(false);
    expect(canWriteResidentRequests(['tenant', 'authorized_occupant'])).toBe(false);
    expect(canWriteResidentRequests(['family_member'])).toBe(false);
    expect(canWriteResidentRequests(['authorized_occupant'])).toBe(false);
  });

  it('creates a resident request as the current user without impersonation controls', () => {
    expect(resident).toContain('`/v1/condominiums/${condominiumId}/requests`');
    expect(resident).toContain("method: 'POST'");
    expect(resident).toContain('categoryId');
    expect(resident).toContain('priority');
    expect(resident).not.toContain('requesterPersonId');
    expect(resident).not.toContain('Solicitante');
    expect(resident).not.toContain('/people');
  });

  it('never exposes administrative lifecycle or internal-note controls to residents', () => {
    expect(resident).not.toContain('assignedToUserId');
    expect(resident).not.toContain('clearAssignee');
    expect(resident).not.toContain('expectedVersion');
    expect(resident).not.toContain("method: 'PATCH'");
    expect(resident).not.toContain("visibility: 'internal'");
    expect(resident).not.toContain('Nota interna');
    expect(resident).not.toContain('Gestión operativa');
  });

  it('keeps owner communication, cancellation and attachments public and capability-gated', () => {
    expect(resident).toContain('const canWrite = canWriteResidentRequests(roles)');
    expect(resident).toContain("visibility: 'public'");
    expect(resident).toContain('visibility="public"');
    expect(resident).toContain('`/v1/condominiums/${condominiumId}/requests/${request.id}/cancel`');
    expect(resident).toContain('request.submitted_by_user_id === session.user.id');
    expect(resident).toContain('canWrite && !terminal');
    expect(resident).toContain('Consulta de solo lectura');
  });

  it('shows only public timeline and attachment rows even though RLS remains authoritative', () => {
    expect(resident).toContain("event.visibility === 'public'");
    expect(resident).toContain("comment.visibility === 'public'");
    expect(resident).toContain("item.visibility === 'public'");
    expect(resident).toContain('downloadPrivateDocument');
    expect(resident).not.toContain('download-events');
  });

  it('uses human request and unit labels instead of rendering ids as resident copy', () => {
    expect(resident).toContain('{request.request_number}');
    expect(resident).toContain('`Unidad ${unit.code}`');
    expect(resident).not.toMatch(/>\s*\{request\.id\}\s*</);
    expect(resident).not.toMatch(/>\s*\{unit\.id\}\s*</);
  });

  it('consumes the HQ design system with compact responsive touch behavior', () => {
    expect(css).toContain('var(--hq-space-5)');
    expect(css).toContain('var(--hq-control-standard)');
    expect(css).toContain('var(--hq-touch-target)');
    expect(css).toContain('var(--hq-radius-card)');
    expect(css).toContain('var(--hq-shadow-resting)');
    expect(css).toContain('@media (max-width: 900px)');
    expect(css).toContain('@media (max-width: 700px)');
    expect(css).toContain('@media (max-width: 520px)');
    expect(css).not.toContain('overflow-x: auto');
  });
});
