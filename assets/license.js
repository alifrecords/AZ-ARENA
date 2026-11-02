// Bepul sinov (server hisoblaydi), PRO litsenziya (Ed25519 imzo, oflayn tekshiriladi), to'lov oynasi.
window.AZLicense = (() => {
  const LS_DEV = 'az_device', LS_LIC = 'az_license', LS_CACHE = 'az_trial_cache';
  let deviceId = localStorage.getItem(LS_DEV);
  if (!deviceId || !/^[a-f0-9-]{20,64}$/i.test(deviceId)) {
    deviceId = (crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
    localStorage.setItem(LS_DEV, deviceId);
  }

  const state = {
    online: false,
    shortId: '',
    remainingSec: null,
    trialSec: 1200,
    license: null, // {plan, expiresAt, code}
    config: null,
    lastSync: 0
  };
  let listeners = [];
  const emit = () => listeners.forEach((f) => f(state));

  function fingerprint() {
    const s = [navigator.userAgent, navigator.language, screen.width + 'x' + screen.height, screen.colorDepth, Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.hardwareConcurrency || 0].join('|');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  }

  const b64urlToBytes = (s) => {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  };

  async function verify(token) {
    try {
      const [body, sig] = token.split('.');
      const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)));
      if (payload.d !== deviceId) return null;
      if (payload.e && payload.e < Date.now()) return null;
      const pub = (window.AZ_ENV || {}).pubKey;
      if (pub && crypto.subtle) {
        try {
          const key = await crypto.subtle.importKey('raw', b64urlToBytes(pub), { name: 'Ed25519' }, false, ['verify']);
          const ok = await crypto.subtle.verify({ name: 'Ed25519' }, key, b64urlToBytes(sig), new TextEncoder().encode(body));
          if (!ok) return null;
        } catch (e) {
          // Eski brauzer Ed25519'ni bilmasa, imzo serverda tekshirilgan deb qabul qilinadi
          if (!state.online) return null;
        }
      }
      return { plan: payload.p, expiresAt: payload.e, code: payload.c };
    } catch (_) { return null; }
  }

  async function applyLicense(lic) {
    if (lic && lic.token) {
      const v = await verify(lic.token);
      if (v) { localStorage.setItem(LS_LIC, lic.token); state.license = v; return; }
    }
    state.license = null;
  }

  async function post(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'Server xatosi'), { status: r.status });
    return j;
  }

  function cache() {
    localStorage.setItem(LS_CACHE, JSON.stringify({ shortId: state.shortId, remainingSec: state.remainingSec, trialSec: state.trialSec, config: state.config }));
  }

  async function start() {
    // avval saqlangan litsenziya (oflayn ishlash uchun)
    const saved = localStorage.getItem(LS_LIC);
    if (saved) state.license = await verify(saved);
    try {
      const c = JSON.parse(localStorage.getItem(LS_CACHE) || 'null');
      if (c) Object.assign(state, { shortId: c.shortId, remainingSec: c.remainingSec, trialSec: c.trialSec, config: c.config });
    } catch (_) {}
    try {
      const j = await post('/api/session', { deviceId, fp: fingerprint() });
      state.online = true;
      Object.assign(state, { shortId: j.shortId, remainingSec: j.remainingSec, trialSec: j.trialSec, config: j.config, lastSync: Date.now() });
      if (j.license) await applyLicense(j.license);
      else if (state.license) { state.license = null; localStorage.removeItem(LS_LIC); } // admin bekor qilgan
      cache();
    } catch (e) {
      state.online = false;
      if (state.remainingSec == null) state.remainingSec = 0;
    }
    emit();
    setInterval(tick, 30000);
    setInterval(localCountdown, 1000);
  }

  async function tick() {
    try {
      const j = await post('/api/tick', { deviceId, fp: fingerprint() });
      state.online = true;
      state.remainingSec = j.remainingSec; state.trialSec = j.trialSec; state.lastSync = Date.now();
      if (j.license) await applyLicense(j.license);
      else if (state.license) { state.license = null; localStorage.removeItem(LS_LIC); }
      cache();
    } catch (_) { state.online = false; }
    emit();
  }

  function localCountdown() {
    if (state.license) {
      if (state.license.expiresAt && state.license.expiresAt < Date.now()) { state.license = null; localStorage.removeItem(LS_LIC); emit(); }
      return;
    }
    if (state.remainingSec > 0 && !document.hidden) {
      state.remainingSec = Math.max(0, state.remainingSec - 1);
      if (state.remainingSec % 10 === 0) cache();
      emit();
    }
  }

  async function activate(code) {
    const j = await post('/api/activate', { deviceId, code });
    await applyLicense(j.license);
    if (!state.license) throw new Error('Litsenziya tekshiruvidan o\'tmadi');
    emit();
    return state.license;
  }

  async function refreshConfig() {
    try {
      const r = await fetch('/api/config');
      state.config = await r.json();
      cache(); emit();
    } catch (_) {}
  }

  const isLocked = () => !state.license && state.remainingSec !== null && state.remainingSec <= 0;

  return { start, activate, refreshConfig, state, isLocked, onChange: (f) => listeners.push(f), deviceId };
})();
