// Admin: xaridor botga yuborgan chek rasmi (Telegram'dan olib beriladi).
import { adminOnly, json } from "../_db.js";
import { tg, botToken } from "../_arena.js";
export const onRequestGet = adminOnly(async ({ request, env }) => {
  const id = new URL(request.url).searchParams.get("id") || "";
  const p = await env.DB.prepare("SELECT photo FROM ar_payments WHERE id = ?").bind(id).first();
  if (!p || !p.photo) return json({ error: "Rasm yo'q" }, 404);
  const f = await tg(env, "getFile", { file_id: p.photo });
  const r = await fetch((env.TG_API || "https://api.telegram.org") + "/file/bot" + (await botToken(env)) + "/" + f.file_path);
  return new Response(r.body, { headers: { "Content-Type": r.headers.get("content-type") || "image/jpeg", "Cache-Control": "private, max-age=3600" } });
});
