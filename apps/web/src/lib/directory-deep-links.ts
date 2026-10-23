export type DirectoryDestination = 'units' | 'people';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isDirectoryIdentifier(id: string): boolean {
  return UUID.test(id);
}

/** Navigation hints are not access tokens. The destination always resolves the ID
 * against the current condominium's RLS-scoped directory before opening it.
 */
export function directoryDetailHref(
  destination: DirectoryDestination,
  id: string,
  condominiumId?: string,
): string {
  if (!UUID.test(id) || (condominiumId && !UUID.test(condominiumId))) {
    throw new Error('Invalid directory detail identifier');
  }
  const query = new URLSearchParams({ [destination === 'units' ? 'unit' : 'person']: id });
  if (condominiumId) query.set('condominium', condominiumId);
  return `/app/${destination}?${query.toString()}`;
}

export function directoryRequestedCondominium(search: string): string | null {
  const values = new URLSearchParams(search).getAll('condominium');
  return values.length === 1 && UUID.test(values[0] ?? '') ? values[0]! : null;
}

/** Resolve only within an already-authorized, current-condominium directory. */
export function findDirectoryTarget<T extends { id: string }>(
  records: readonly T[],
  requestedId: string | null,
): T | null {
  return requestedId && isDirectoryIdentifier(requestedId)
    ? (records.find((item) => item.id === requestedId) ?? null)
    : null;
}

export function directoryRequestedId(
  destination: DirectoryDestination,
  search: string,
): string | null {
  const params = new URLSearchParams(search);
  const field = destination === 'units' ? 'unit' : 'person';
  const values = params.getAll(field);
  // Duplicate or malformed query keys are not silently interpreted.
  return values.length === 1 && UUID.test(values[0] ?? '') ? values[0]! : null;
}

/**
 * A directory detail link is an entry action, not a permanent "open this drawer"
 * preference. Consume the hint after the authorized directory has resolved it so
 * closing the detail and refreshing the list cannot resurrect a stale selection.
 * Keep the condominium hint (and all unrelated parameters/hash) intact.
 */
export function consumeDirectoryDetailHint(
  destination: DirectoryDestination,
  requestedId: string,
): boolean {
  if (typeof window === 'undefined') return false;
  const url = new URL(window.location.href);
  if (
    url.pathname !== `/app/${destination}` ||
    directoryRequestedId(destination, url.search) !== requestedId
  ) {
    return false;
  }
  url.searchParams.delete(destination === 'units' ? 'unit' : 'person');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return true;
}
