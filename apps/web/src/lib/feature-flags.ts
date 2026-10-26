/**
 * Experimental surfaces must be opted into per build. In particular, this prevents a mock
 * administrative route from being exposed merely because its bundle was deployed.
 */
export function isExplicitlyEnabled(value: string | undefined): boolean {
  return value === 'true';
}

export const BOARD_GROUPS_PREVIEW_ENABLED = isExplicitlyEnabled(
  import.meta.env.VITE_ENABLE_BOARD_GROUPS_PREVIEW,
);
