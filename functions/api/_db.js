// AZIMXODJAYEV MUSIC ARENA — umumiy yordamchilar (Cloudflare Pages Functions + D1).
// Tuzilish AZ-Playlist bilan bir xil:
//  • D1 bazasi Cloudflare'da "DB" nomi bilan ulanadi (Settings → Bindings). AZ-Playlist bazasini ham ulasa bo'ladi:
//    ARENA jadvallari "ar_" bilan boshlanadi va playlist jadvallariga tegmaydi.
//  • Admin GitHub tokeni bilan kiradi: token ADMIN_REPO repozitoriyiga yozish huquqiga ega bo'lishi kerak.
//  • Ixtiyoriy o'zgaruvchilar: ADMIN_REPO (standart "alifrecords/AZ-Arena"), BOT_TOKEN (admin sahifadan ham kiritsa bo'ladi).

export const DEFAULT_SETTINGS = {
  card: { number: "", holder: "", system: "UZCARD" },
  trialMinutes: 20,
  tariffs: [
    { id: "1M", name: "1 oy", days: 30, price: 99000, active: true },
    { id: "6M", name: "6 oy", days: 180, price: 449000, active: true },
    { id: "UB", name: "Umrbod", days: 0, price: 990000, active: true },
  ],
  bot: { notify: true, autoSend: false, remind: true },
};

let ready = false;
export async function ensureSchema(db) {
  if (ready) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS ar_kv (k TEXT PRIMARY KEY, v TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ar_devices (id TEXT PRIMARY KEY, short TEXT UNIQUE, fp TEXT, first INTEGER, last INTEGER, last_tick INTEGER, used REAL NOT NULL DEFAULT 0)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ar_fp (fp TEXT PRIMARY KEY, used REAL NOT NULL DEFAULT 0)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ar_codes (code TEXT PRIMARY KEY, plan_id TEXT, plan_name TEXT, days INTEGER, status TEXT NOT NULL, created INTEGER, created_by TEXT, payment_id TEXT, tg_user INTEGER, tg_username TEXT, device TEXT, activated INTEGER, expires INTEGER, reminded INTEGER NOT NULL DEFAULT 0)"),
    db.prepare("CREATE INDEX IF NOT EXISTS ar_codes_device ON ar_codes(device)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ar_payments (id TEXT PRIMARY KEY, short TEXT, plan_id TEXT, plan_name TEXT, amount INTEGER, tg_user INTEGER, tg_username TEXT, tg_name TEXT, photo TEXT, photo_kind TEXT, status TEXT NOT NULL, created INTEGER, decided INTEGER, code TEXT, admin_chat TEXT, admin_msg INTEGER, admin_caption TEXT)"),
    db.prepare("CREATE INDEX IF NOT EXISTS ar_payments_status ON ar_payments(status, created)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ar_sessions (uid INTEGER PRIMARY KEY, short TEXT, plan_id TEXT, step TEXT, ts INTEGER)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ar_fail (ip TEXT, ts INTEGER)"),
  ]);
  ready = true;
}

export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });

export async function readJson(request, max = 8000) {
  const t = await request.text();
  if (t.length > max) throw Object.assign(new Error("big"), { status: 413 });
  try { return JSON.parse(t || "{}"); } catch { throw Object.assign(new Error("bad"), { status: 400 }); }
}

export function guard(fn) {
  return async (ctx) => {
    try {
      if (!ctx.env.DB) return json({ error: "nodb", msg: "D1 bazasi ulanmagan: Cloudflare → Settings → Bindings → D1 → nomi DB" }, 503);
      await ensureSchema(ctx.env.DB);
      return await fn(ctx);
    } catch (e) {
      return json({ error: e.status ? "bad" : "server", msg: String((e && e.message) || e).slice(0, 200) }, e.status || 500);
    }
  };
}

export async function kvGet(db, k) {
  const r = await db.prepare("SELECT v FROM ar_kv WHERE k = ?").bind(k).first();
  return r ? r.v : null;
}
export async function kvSet(db, k, v) {
  await db.prepare("INSERT INTO ar_kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, v == null ? null : String(v)).run();
}

export async function getSettings(db) {
  const raw = await kvGet(db, "settings");
  let s = {};
  try { s = raw ? JSON.parse(raw) : {}; } catch { s = {}; }
  return {
    ...DEFAULT_SETTINGS, ...s,
    card: { ...DEFAULT_SETTINGS.card, ...(s.card || {}) },
    bot: { ...DEFAULT_SETTINGS.bot, ...(s.bot || {}) },
    tariffs: Array.isArray(s.tariffs) ? s.tariffs : DEFAULT_SETTINGS.tariffs,
  };
}
export async function saveSettings(db, s) { await kvSet(db, "settings", JSON.stringify(s)); }

/* ---- admin: GitHub token bilan kirish (AZ-Playlist bilan bir xil) ---- */
async function sha256(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const okTokens = new Map();
export const adminRepo = (env) => env.ADMIN_REPO || "alifrecords/AZ-Arena";
export async function isAdmin(request, env) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token.length > 300) return false;
  const key = await sha256(token);
  const exp = okTokens.get(key);
  if (exp && exp > Date.now()) return true;
  const r = await fetch((env.GH_API || "https://api.github.com") + "/repos/" + adminRepo(env), {
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "az-arena" },
  });
  if (!r.ok) return false;
  const j = await r.json();
  if (!j.permissions || !j.permissions.push) return false;
  okTokens.set(key, Date.now() + 10 * 60 * 1000);
  return true;
}
export function adminOnly(fn) {
  return guard(async (ctx) => {
    if (!(await isAdmin(ctx.request, ctx.env))) return json({ error: "auth", msg: "Token noto'g'ri yoki " + adminRepo(ctx.env) + " repoga yozish huquqi yo'q" }, 401);
    return fn(ctx);
  });
}

/* ---- base64url ---- */
export const b64u = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/* ---- Litsenziya imzosi: Ed25519. Kalit birinchi chaqiruvda yaratiladi va D1 da saqlanadi. ---- */
let edCache = null;
export async function edKeys(db) {
  if (edCache) return edCache;
  let jwk = await kvGet(db, "ed_private"), pub = await kvGet(db, "ed_public");
  if (!jwk || !pub) {
    const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    jwk = JSON.stringify(await crypto.subtle.exportKey("jwk", kp.privateKey));
    pub = b64u(await crypto.subtle.exportKey("raw", kp.publicKey));
    await kvSet(db, "ed_private", jwk);
    await kvSet(db, "ed_public", pub);
  }
  const key = await crypto.subtle.importKey("jwk", JSON.parse(jwk), { name: "Ed25519" }, false, ["sign"]);
  edCache = { key, pub };
  return edCache;
}
export async function signLicense(db, payload) {
  const { key } = await edKeys(db);
  const body = b64u(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(body));
  return body + "." + b64u(sig);
}

export const clientIp = (request) => request.headers.get("CF-Connecting-IP") || "0.0.0.0";
export const DEVICE_RE = /^[a-f0-9-]{20,64}$/i;
