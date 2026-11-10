/* Runtime configuration. PUBLIC_URL / SHARE_QUERY are filled in for the
   Android build so the app can reach the shared calendar cross-origin. */
export const PUBLIC_URL = '__PUBLISHED_URL__';
export const SHARE_QUERY = '__SHARE_QUERY__';

/* The published app sits behind a gateway that accepts a share code either
   as a cookie or as a query parameter. Native WebViews cannot rely on that
   cookie, so every API request carries the code explicitly. */
export function gatewayQuery() {
  if (SHARE_QUERY && SHARE_QUERY.indexOf('__') !== 0) return SHARE_QUERY;
  try {
    const code = new URLSearchParams(location.search).get('sharecode');
    return code ? '?sharecode=' + encodeURIComponent(code) : '';
  } catch (_) { return ''; }
}

export const CATEGORIES = [
  { id: 'quiz', label: 'Quiz', icon: 'quiz' },
  { id: 'live', label: 'Live Music', icon: 'music' },
  { id: 'comedy', label: 'Comedy', icon: 'mic' },
  { id: 'dj', label: 'DJ & Dancing', icon: 'disc' },
  { id: 'food', label: 'Food & Drink', icon: 'glass' },
  { id: 'special', label: 'Specials', icon: 'star' }
];

export function isNative() {
  if (window.OLP_NATIVE) return true;
  return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
}

export function apiBase() {
  if (isNative() && /^https?:\/\//.test(PUBLIC_URL)) return PUBLIC_URL.replace(/\/$/, '');
  return '';
}
