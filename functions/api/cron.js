// Har soatda GitHub Actions chaqiradi: PRO muddati 3 kun ichida tugaydiganlarga eslatma.
import { guard, json, getSettings } from "./_db.js";
import { send } from "./_arena.js";
export const onRequestPost = guard(async ({ env }) => {
  const db = env.DB, now = Date.now();
  const st = await getSettings(db);
  if (!st.bot.remind) return json({ ok: true, sent: 0 });
  const rows = (await db.prepare("SELECT code, tg_user, expires FROM ar_codes WHERE status = 'active' AND reminded = 0 AND tg_user IS NOT NULL AND expires > ? AND expires < ? LIMIT 50").bind(now, now + 3 * 864e5).all()).results || [];
  let sent = 0;
  for (const c of rows) {
    try {
      await send(env, c.tg_user, `PRO tarifingiz muddati ${new Date(c.expires).toLocaleDateString("ru-RU")} da tugaydi. Uzaytirish uchun /start bosing.`);
      sent++;
    } catch (_) {}
    await db.prepare("UPDATE ar_codes SET reminded = 1 WHERE code = ?").bind(c.code).run();
  }
  return json({ ok: true, sent });
});
