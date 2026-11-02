// Admin: foydalanuvchiga sinov vaqtini qaytadan berish.
import { adminOnly, json, readJson } from "../_db.js";
export const onRequestPost = adminOnly(async ({ request, env }) => {
  const b = await readJson(request, 500);
  if (b.action !== "reset") return json({ error: "bad" }, 400);
  const d = await env.DB.prepare("SELECT id, fp FROM ar_devices WHERE short = ?").bind(String(b.shortId || "")).first();
  if (!d) return json({ error: "Qurilma topilmadi" }, 404);
  await env.DB.prepare("UPDATE ar_devices SET used = 0 WHERE id = ?").bind(d.id).run();
  if (d.fp) await env.DB.prepare("DELETE FROM ar_fp WHERE fp = ?").bind(d.fp).run();
  return json({ ok: true });
});
