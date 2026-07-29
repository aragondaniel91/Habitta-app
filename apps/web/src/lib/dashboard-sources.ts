// Dashboard blocks degrade independently so one unavailable source never hides the full workspace.
export type DashboardSourceResult<T> = {
  value: T;
  warning?: string;
};

export async function settleDashboardSource<T>(
  label: string,
  request: Promise<T>,
  fallback: T,
): Promise<DashboardSourceResult<T>> {
  try {
    return { value: await request };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'solicitud no disponible';
    return { value: fallback, warning: `${label}: ${detail}` };
  }
}

export function buildDashboardSourceWarning(results: DashboardSourceResult<unknown>[]) {
  const warnings = results.flatMap((result) => (result.warning ? [result.warning] : []));
  return warnings.length
    ? `Algunos bloques no pudieron actualizarse. ${warnings.join(' · ')}`
    : '';
}
