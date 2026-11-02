// Admin: qo'lda kod yaratish va kodni bekor qilish.
import { adminOnly, json, readJson } from "../_db.js";
import { createCode } from "../_arena.js";
export const onRequestPost = adminOnly(async ({ request, env }) => {
  const b = await readJson(request, 500);
  if (b.action === "create") return json({ ok: true, code: await createCode(env.DB, String(b.planId || "").toUpperCase(), { createdBy: "admin (qo'lda)" }) });
  if (b.action === "revoke") {
    const r = await env.DB.prepare("UPDATE ar_codes SET status = 'revoked' WHERE code = ?").bind(String(b.code || "")).run();
    return json({ ok: !!(r.meta && r.meta.changes) });
  }
  return json({ error: "bad" }, 400);
});
