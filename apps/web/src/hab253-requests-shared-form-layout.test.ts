import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const requestsSource = source('./pages/RequestsPage.tsx');
const requestsStyles = source('./requests.css');
const parityMatrixSource = source('../../../docs/frontend/form-parity-matrix.md');

describe('HAB-253 Requests shared form layout', () => {
  it('uses shared form grids and actions for create, categories and operational management', () => {
    expect(requestsSource).toContain(
      "import { FormActions, FormGrid } from '../components/FormLayout'",
    );
    expect(requestsSource.match(/<FormGrid>/g)?.length).toBe(3);
    expect(requestsSource.match(/<FormActions/g)?.length).toBe(3);
    expect(requestsSource).not.toContain('className="requests-form__grid"');
    expect(requestsStyles).not.toContain('.requests-form__grid');
  });

  it('preserves UUID-backed selector and creation payload semantics', () => {
    expect(requestsSource).toContain('if (unitId) payload.unitId = unitId');
    expect(requestsSource).toContain('if (requesterPersonId) payload.requesterPersonId = requesterPersonId');
    expect(requestsSource).toContain('<option key={item.id} value={item.id}>');
    expect(requestsSource).toContain('payload.categoryId = categoryId');
    expect(requestsSource).toContain('payload.assignedToUserId = assignee');
    expect(requestsSource).toContain("<option key={item.id} value={item.auth_user_id ?? ''}>");
  });

  it('preserves optimistic concurrency, workflow transitions and cancellation', () => {
    expect(requestsSource).toContain('{ expectedVersion: request.version }');
    expect(requestsSource).toContain('nextRequestStatuses(request.status)');
    expect(requestsSource).toContain('payload.status = status');
    expect(requestsSource).toContain("['closed', 'cancelled'].includes(request.status)");
    expect(requestsSource).toContain('${request.id}/cancel');
    expect(requestsSource).toContain('reason: cancelReason.trim()');
  });

  it('preserves internal/public visibility and private attachment behavior', () => {
    expect(requestsSource).toContain("useState<ServiceRequestVisibility>('public')");
    expect(requestsSource).toContain('body: JSON.stringify({ body: comment.trim(), visibility })');
    expect(requestsSource).toContain('<option value="internal">Nota interna</option>');
    expect(requestsSource).toContain('visibility={visibility}');
    expect(requestsSource).toContain('${request.id}/attachments');
    expect(requestsSource).toContain('${attachment.id}/file');
  });

  it('keeps local presentation hooks only where they add Requests-specific styling', () => {
    expect(requestsStyles).toContain('.requests-form__actions');
    expect(requestsStyles).toContain('border-top: 1px solid var(--border-subtle)');
    expect(requestsStyles).toContain('.request-management-panel__actions');
    expect(requestsStyles).toContain('margin-top: 0.85rem');
  });

  it('marks Requests compliant only after the focused migration', () => {
    expect(parityMatrixSource).toContain(
      '| Solicitudes | RequestsPage create, categories y gestión operativa | compliant | Sí | Sí | Sí | Sí |',
    );
  });
});
