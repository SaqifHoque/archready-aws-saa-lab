(() => {
  'use strict';

  const config = window.ARCHREADY_CLOUD || {};
  const AUTH_KEY = 'archready-cloud-auth-v1';
  const PKCE_KEY = 'archready-pkce-v1';
  let auth = read(sessionStorage.getItem(AUTH_KEY), null);
  let saveTimer = null;

  function read(value, fallback) { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
  function localMode() { return config.mode === 'local'; }
  function configured() { return Boolean(config.enabled && config.apiUrl && (localMode() || (config.cognitoDomain && config.clientId))); }
  function domain() { return String(config.cognitoDomain).replace(/\/$/, ''); }
  function redirectUri() { return config.redirectUri || `${location.origin}${location.pathname}`; }
  function logoutUri() { return config.logoutUri || redirectUri(); }
  function base64url(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function randomValue(size = 48) { const bytes = new Uint8Array(size); crypto.getRandomValues(bytes); return base64url(bytes); }
  function decodeJwt(token) { try { const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '='))); } catch { return {}; } }
  function valid() { return localMode() || Boolean(auth?.access_token && decodeJwt(auth.access_token).exp * 1000 > Date.now() + 60_000); }
  function persist(tokens) { auth = { ...auth, ...tokens, savedAt: Date.now() }; sessionStorage.setItem(AUTH_KEY, JSON.stringify(auth)); status('synced'); }
  function status(state, message = '') { window.dispatchEvent(new CustomEvent('archready-cloud-status', { detail: { state, message } })); }

  async function exchange(params) {
    const response = await fetch(`${domain()}/oauth2/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params),
    });
    if (!response.ok) throw new Error(`Authentication failed (${response.status})`);
    return response.json();
  }

  async function refresh() {
    if (!auth?.refresh_token) return false;
    try {
      const tokens = await exchange({ grant_type: 'refresh_token', client_id: config.clientId, refresh_token: auth.refresh_token });
      persist(tokens); return true;
    } catch { clearAuth(); return false; }
  }

  async function init() {
    if (!configured()) return false;
    if (localMode()) {
      const response = await fetch(`${String(config.apiUrl).replace(/\/$/, '')}/health`, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Database service unavailable (${response.status})`);
      status('synced');
      return true;
    }
    const params = new URLSearchParams(location.search);
    if (params.has('code')) {
      const pending = read(sessionStorage.getItem(PKCE_KEY), null);
      if (!pending || pending.state !== params.get('state')) throw new Error('The sign-in state did not match. Please try again.');
      status('syncing', 'Completing sign-in…');
      const tokens = await exchange({ grant_type: 'authorization_code', client_id: config.clientId, code: params.get('code'), redirect_uri: redirectUri(), code_verifier: pending.verifier });
      persist(tokens); sessionStorage.removeItem(PKCE_KEY);
      history.replaceState({}, document.title, `${location.pathname}${location.hash || '#dashboard'}`);
      return true;
    }
    if (!valid() && auth?.refresh_token) await refresh();
    return valid();
  }

  async function signIn() {
    if (!configured() || localMode()) return;
    const verifier = randomValue();
    const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const state = randomValue(18);
    sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
    const query = new URLSearchParams({ response_type: 'code', client_id: config.clientId, redirect_uri: redirectUri(), scope: 'openid email profile', code_challenge_method: 'S256', code_challenge: challenge, state });
    location.assign(`${domain()}/oauth2/authorize?${query}`);
  }

  function clearAuth() { auth = null; sessionStorage.removeItem(AUTH_KEY); status('local'); }
  function signOut() {
    if (localMode()) return;
    clearAuth();
    if (configured()) location.assign(`${domain()}/logout?${new URLSearchParams({ client_id: config.clientId, logout_uri: logoutUri() })}`);
  }

  async function api(method, payload) {
    if (!localMode() && !valid() && !(await refresh())) throw new Error('Sign in to synchronize progress.');
    const headers = { 'Content-Type': 'application/json' };
    if (!localMode()) headers.Authorization = `Bearer ${auth.access_token}`;
    const response = await fetch(`${String(config.apiUrl).replace(/\/$/, '')}/progress`, {
      method, headers, body: payload ? JSON.stringify(payload) : undefined,
    });
    if (response.status === 401) { clearAuth(); throw new Error('Your session expired. Please sign in again.'); }
    if (!response.ok) throw new Error(`Cloud sync failed (${response.status})`);
    return response.status === 204 ? null : response.json();
  }

  async function load() { status('syncing', 'Loading cloud progress…'); const result = await api('GET'); status('synced'); return result?.progress || null; }
  async function save(progress) { status('syncing', 'Saving…'); await api('PUT', { progress }); status('synced'); }
  function scheduleSave(progress) {
    if (!configured() || !valid()) return;
    clearTimeout(saveTimer); const snapshot = JSON.parse(JSON.stringify(progress));
    saveTimer = setTimeout(() => save(snapshot).catch((error) => status('error', error.message)), 900);
  }
  function user() {
    if (localMode()) return { email: 'Database synced', sub: 'local-default' };
    const claims = decodeJwt(auth?.id_token || auth?.access_token || '');
    return { email: claims.email || claims['cognito:username'] || 'AWS learner', sub: claims.sub };
  }

  window.CloudProgress = { configured, init, signIn, signOut, load, save, scheduleSave, isSignedIn: () => valid(), user, mode: () => config.mode || 'cognito' };
})();
