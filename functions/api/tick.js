// Dastur ochiq turganda har 30 soniyada: foydalanish vaqti serverda hisoblanadi.
import { guard, json, readJson, DEVICE_RE } from "./_db.js";
import { ensureDevice, sessionInfo, licenseFor } from "./_arena.js";
export const onRequestPost = guard(async ({ request, env }) => {
  const b = await readJson(request, 500);
  if (!DEVICE_RE.test(b.deviceId || "")) return json({ error: "deviceId xato" }, 400);
  const db = env.DB;
  const d = await ensureDevice(db, b.deviceId, b.fp);
  const now = Date.now();
  if (d.last_tick && !(await licenseFor(db, d.id))) {
    const delta = Math.min(45, Math.max(0, (now - d.last_tick) / 1000));
    d.used = (d.used || 0) + delta;
    await db.prepare("UPDATE ar_devices SET used = ? WHERE id = ?").bind(d.used, d.id).run();
    if (d.fp) await db.prepare("INSERT INTO ar_fp (fp, used) VALUES (?, ?) ON CONFLICT(fp) DO UPDATE SET used = MAX(used, excluded.used)").bind(d.fp, d.used).run();
  }
  await db.prepare("UPDATE ar_devices SET last = ?, last_tick = ? WHERE id = ?").bind(now, now, d.id).run();
  return json(await sessionInfo(db, d));
});
