import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const rememberSessionKey = 'habitta.auth.remember-session';

function canUseBrowserStorage() {
  return (
    typeof window !== 'undefined' && Boolean(window.localStorage) && Boolean(window.sessionStorage)
  );
}

export function getRememberSession() {
  if (!canUseBrowserStorage()) return true;
  try {
    return window.localStorage.getItem(rememberSessionKey) !== 'false';
  } catch {
    return true;
  }
}

export function setRememberSession(remember: boolean) {
  if (!canUseBrowserStorage()) return;
  try {
    window.localStorage.setItem(rememberSessionKey, String(remember));
  } catch {
    // Storage is unavailable (e.g. private browsing); the preference just won't persist.
  }
}

const authStorage = {
  getItem(keyName: string) {
    if (!canUseBrowserStorage()) return null;
    try {
      const storage = getRememberSession() ? window.localStorage : window.sessionStorage;
      return storage.getItem(keyName);
    } catch {
      return null;
    }
  },
  setItem(keyName: string, value: string) {
    if (!canUseBrowserStorage()) return;
    try {
      const primary = getRememberSession() ? window.localStorage : window.sessionStorage;
      const secondary = getRememberSession() ? window.sessionStorage : window.localStorage;
      secondary.removeItem(keyName);
      primary.setItem(keyName, value);
    } catch {
      // Storage is unavailable; Supabase keeps the session in memory for this page load.
    }
  },
  removeItem(keyName: string) {
    if (!canUseBrowserStorage()) return;
    try {
      window.localStorage.removeItem(keyName);
      window.sessionStorage.removeItem(keyName);
    } catch {
      // Nothing to clean up if storage already isn't accessible.
    }
  },
};

export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
          storage: authStorage,
        },
      })
    : null;
