import { describe, expect, it } from 'vitest';
import {
  filterServiceRequests,
  getRequestStats,
  isOverdueRequest,
  nextRequestStatuses,
  type ServiceRequestRecord,
} from './service-requests';

const request = (patch: Partial<ServiceRequestRecord> = {}): ServiceRequestRecord => ({
  id: 'request-1',
  request_number: 'SR-2026-000001',
  condominium_id: 'condo-1',
  unit_id: 'unit-1',
  category_id: 'category-1',
  requester_person_id: 'person-1',
  submitted_by_user_id: 'user-1',
  assigned_to_user_id: null,
  title: 'Fuga de agua',
  description: 'Existe una filtración en el pasillo.',
  priority: 'normal',
  status: 'submitted',
  due_at: null,
  resolution_summary: null,
  version: 1,
  created_at: '2026-07-20T12:00:00Z',
  updated_at: '2026-07-20T12:00:00Z',
  ...patch,
});

const categories = [
  {
    id: 'category-1',
    condominium_id: 'condo-1',
    code: 'maintenance',
    name: 'Mantenimiento',
    description: null,
    sort_order: 10,
    is_active: true,
  },
];
const units = [{ id: 'unit-1', code: '2A', status: 'active' }];
const people = [{ id: 'person-1', first_name: 'Ana', last_name: 'Rodríguez' }];

describe('service request workspace helpers', () => {
  it('keeps operational metrics independent', () => {
    const rows = [
      request({ priority: 'urgent', due_at: '2026-07-01T12:00:00Z' }),
      request({ id: 'request-2', status: 'closed', assigned_to_user_id: 'user-2' }),
      request({ id: 'request-3', status: 'in_progress', assigned_to_user_id: 'user-2' }),
    ];
    expect(getRequestStats(rows, new Date('2026-07-29T12:00:00Z'))).toEqual({
      open: 2,
      urgent: 1,
      overdue: 1,
      unassigned: 1,
    });
    expect(isOverdueRequest(rows[1]!, new Date('2026-07-29T12:00:00Z'))).toBe(false);
  });

  it('searches across request, category, unit and requester data', () => {
    const rows = filterServiceRequests([request()], categories, units, people, {
      query: 'rodriguez',
      status: '',
      priority: '',
      categoryId: '',
      unitId: '',
      assignment: '',
    });
    expect(rows).toHaveLength(1);
  });

  it('combines priority and assignment filters without leaking other rows', () => {
    const rows = filterServiceRequests(
      [
        request({ priority: 'urgent' }),
        request({ id: 'request-2', priority: 'urgent', assigned_to_user_id: 'user-2' }),
        request({ id: 'request-3', priority: 'normal' }),
      ],
      categories,
      units,
      people,
      {
        query: '',
        status: '',
        priority: 'urgent',
        categoryId: '',
        unitId: '',
        assignment: 'unassigned',
      },
    );
    expect(rows.map((item) => item.id)).toEqual(['request-1']);
  });

  it('exposes only valid non-cancellation transitions', () => {
    expect(nextRequestStatuses('submitted')).toEqual(['acknowledged', 'in_progress']);
    expect(nextRequestStatuses('resolved')).toEqual(['in_progress', 'closed']);
    expect(nextRequestStatuses('closed')).toEqual([]);
  });
});
