import { describe, expect, it } from 'vitest';
import { membershipRoles } from './index';

describe('membership roles', () => {
  it('exposes the approved baseline roles', () => {
    expect(membershipRoles).toContain('administrator');
    expect(membershipRoles).toContain('tenant');
  });
});
