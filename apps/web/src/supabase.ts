import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const rememberSessionKey = 'habitta.auth.remember-session';

function canUseBrowserStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage) && Boolean(window.sessionStorage);
}

export function getRememberSession() {
  if (!canUseBrowserStorage()) return true;
  return window.localStorage.getItem(rememberSessionKey) !== 'false';
}

export function setRememberSession(remember: boolean) {
  if (!canUseBrowserStorage()) return;
  window.localStorage.setItem(rememberSessionKey, String(remember));
}

const authStorage = {
  getItem(keyName: string) {
    if (!canUseBrowserStorage()) return null;
    const storage = getRememberSession() ? window.localStorage : window.sessionStorage;
    return storage.getItem(keyName);
  },
  setItem(keyName: string, value: string) {
    if (!canUseBrowserStorage()) return;
    const primary = getRememberSession() ? window.localStorage : window.sessionStorage;
    const secondary = getRememberSession() ? window.sessionStorage : window.localStorage;
    secondary.removeItem(keyName);
    primary.setItem(keyName, value);
  },
  removeItem(keyName: string) {
    if (!canUseBrowserStorage()) return;
    window.localStorage.removeItem(keyName);
    window.sessionStorage.removeItem(keyName);
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
