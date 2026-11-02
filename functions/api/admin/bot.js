// Admin: Telegram botni ulash (webhook), admin chatini bog'lash, sinov xabari.
// POST {action:"connect", token} — tokenni tekshiradi, saqlaydi va webhook o'rnatadi
// POST {action:"linkcode"} — admin chatini bog'lash uchun bir martalik kod
// POST {action:"test"} · {action:"disconnect"}
import { adminOnly, json, readJson, kvGet, kvSet, b64u } from "../_db.js";
import { tg, send } from "../_arena.js";

export const onRequestPost = adminOnly(async ({ request, env }) => {
  const db = env.DB, b = await readJson(request, 1000);
  const origin = new URL(request.url).origin;
  if (b.action === "connect") {
    const token = String(b.token || "").trim();
    if (token && !/^\d{5,}:[\w-]{20,}$/.test(token)) return json({ error: "Token ko'rinishi noto'g'ri. BotFather bergan tokenni to'liq nusxalang." }, 400);
    if (token) await kvSet(db, "bot_token", token);
    let me;
    try { me = await tg(env, "getMe"); } catch (e) { return json({ error: "Telegram tokenni qabul qilmadi: " + e.message }, 400); }
    const secret = b64u(crypto.getRandomValues(new Uint8Array(24)));
    await kvSet(db, "bot_secret", secret);
    await tg(env, "setWebhook", { url: origin + "/api/tg/hook", secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
    await kvSet(db, "bot_username", me.username);
    try {
      await tg(env, "setMyCommands", { commands: [{ command: "start", description: "PRO tarif sotib olish" }, { command: "id", description: "Chat ID" }] });
    } catch (_) {}
    return json({ ok: true, username: me.username });
  }
  if (b.action === "linkcode") {
    const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
    await kvSet(db, "admin_link_code", code + ":" + (Date.now() + 15 * 60000));
    return json({ ok: true, code, username: await kvGet(db, "bot_username") });
  }
  if (b.action === "test") {
    const chat = await kvGet(db, "admin_chat");
    if (!chat) return json({ error: "Admin chati bog'lanmagan" }, 400);
    await send(env, chat, "AZ MUSIC ARENA: bildirishnomalar ishlayapti. Yangi to'lov cheklari shu yerga keladi.");
    return json({ ok: true });
  }
  if (b.action === "disconnect") {
    try { await tg(env, "deleteWebhook", {}); } catch (_) {}
    await kvSet(db, "bot_token", ""); await kvSet(db, "bot_username", ""); await kvSet(db, "bot_secret", "");
    return json({ ok: true });
  }
  return json({ error: "bad" }, 400);
});
