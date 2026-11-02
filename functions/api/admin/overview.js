// Admin: umumiy ko'rinish — statistika, to'lovlar, kodlar, qurilmalar, sozlamalar.
import { adminOnly, json, getSettings, kvGet, adminRepo } from "../_db.js";
import { codeStatus } from "../_arena.js";
export const onRequestGet = adminOnly(async ({ env }) => {
  const db = env.DB, now = Date.now();
  const s = await getSettings(db);
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const payments = (await db.prepare("SELECT id, short, plan_name, amount, tg_user, tg_username, tg_name, photo, status, created, decided, code FROM ar_payments ORDER BY created DESC LIMIT 200").all()).results || [];
  const codesRaw = (await db.prepare("SELECT c.*, d.short AS dshort FROM ar_codes c LEFT JOIN ar_devices d ON d.id = c.device ORDER BY c.created DESC LIMIT 300").all()).results || [];
  const codes = codesRaw.map((c) => ({ code: c.code, planName: c.plan_name, days: c.days, status: codeStatus(c), createdBy: c.created_by, tgUsername: c.tg_username, shortId: c.dshort, expiresAt: c.expires, activatedAt: c.activated, createdAt: c.created }));
  const devRaw = (await db.prepare("SELECT d.short, d.first, d.last, d.used, (SELECT COUNT(*) FROM ar_codes c WHERE c.device = d.id AND c.status = 'active' AND (c.expires = 0 OR c.expires > ?)) AS pro FROM ar_devices d ORDER BY d.last DESC LIMIT 300").bind(now).all()).results || [];
  const devices = devRaw.map((d) => ({ shortId: d.short, firstSeen: d.first, lastSeen: d.last, usedSec: Math.round(d.used || 0), pro: d.pro > 0 }));
  const one = async (sql, ...a) => (await db.prepare(sql).bind(...a).first()) || {};
  const trialSec = s.trialMinutes * 60;
  const stats = {
    pending: (await one("SELECT COUNT(*) AS n FROM ar_payments WHERE status = 'pending'")).n || 0,
    pro: (await one("SELECT COUNT(*) AS n FROM ar_codes WHERE status = 'active' AND (expires = 0 OR expires > ?)", now)).n || 0,
    trial: (await one("SELECT COUNT(*) AS n FROM ar_devices d WHERE used < ? AND NOT EXISTS (SELECT 1 FROM ar_codes c WHERE c.device = d.id AND c.status = 'active')", trialSec)).n || 0,
    online: (await one("SELECT COUNT(*) AS n FROM ar_devices WHERE last > ?", now - 90000)).n || 0,
    monthRevenue: (await one("SELECT COALESCE(SUM(amount), 0) AS n FROM ar_payments WHERE status = 'approved' AND decided >= ?", monthStart.getTime())).n || 0,
  };
  const botUsername = await kvGet(db, "bot_username");
  const adminChatName = await kvGet(db, "admin_chat_name");
  return json({
    stats, payments: payments.map((p) => ({ ...p, hasPhoto: !!p.photo, photo: undefined })), codes, devices, settings: s,
    bot: { connected: !!botUsername && !!((await kvGet(db, "bot_token")) || env.BOT_TOKEN), username: botUsername || "", adminChat: !!(await kvGet(db, "admin_chat")), adminChatName: adminChatName || "" },
    adminRepo: adminRepo(env),
  });
});
