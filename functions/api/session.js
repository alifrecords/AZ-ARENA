// Dastur ochilganda: qurilma ro'yxatga olinadi, sinov qoldig'i va litsenziya qaytariladi.
import { guard, json, readJson, DEVICE_RE } from "./_db.js";
import { ensureDevice, sessionInfo, publicConfig } from "./_arena.js";
export const onRequestPost = guard(async ({ request, env }) => {
  const b = await readJson(request, 500);
  if (!DEVICE_RE.test(b.deviceId || "")) return json({ error: "deviceId xato" }, 400);
  const d = await ensureDevice(env.DB, b.deviceId, b.fp);
  const now = Date.now();
  await env.DB.prepare("UPDATE ar_devices SET last = ?, last_tick = ? WHERE id = ?").bind(now, now, d.id).run();
  return json({ ...(await sessionInfo(env.DB, d)), config: await publicConfig(env.DB) });
});
