// Telegram webhook: bot xabarlari shu yerga keladi.
// Xaridor: /start AZ-1234 → tarif → karta → chek rasmi → admin tasdiqlaydi → kod keladi.
// Admin: chek tugmalar bilan keladi; /admin <kod> (bog'lash), /kutilayotgan, /kod 1M, /karta.
import { guard, json, kvGet, kvSet, getSettings, saveSettings } from "../_db.js";
import { tg, send, esc, fmtSum, createPayment, approvePayment, rejectPayment, createCode, adminChat } from "../_arena.js";

async function session(db, uid) {
  return (await db.prepare("SELECT * FROM ar_sessions WHERE uid = ?").bind(uid).first()) || { uid, short: null, plan_id: null, step: null };
}
async function saveSession(db, s) {
  await db.prepare("INSERT INTO ar_sessions (uid, short, plan_id, step, ts) VALUES (?, ?, ?, ?, ?) ON CONFLICT(uid) DO UPDATE SET short = excluded.short, plan_id = excluded.plan_id, step = excluded.step, ts = excluded.ts")
    .bind(s.uid, s.short || null, s.plan_id || null, s.step || null, Date.now()).run();
}
async function tariffKeyboard(db) {
  const s = await getSettings(db);
  return { inline_keyboard: s.tariffs.filter((t) => t.active).map((t) => [{ text: `${t.name} — ${fmtSum(t.price)}`, callback_data: "plan:" + t.id }]) };
}
const decisionKb = (id) => ({ inline_keyboard: [[{ text: "Tasdiqlash", callback_data: "ok:" + id }, { text: "Rad etish", callback_data: "no:" + id }]] });

async function onStart(env, msg, payload) {
  const db = env.DB;
  const s = await session(db, msg.from.id);
  const m = String(payload || "").toUpperCase().match(/AZ-\d{4}/);
  if (m) s.short = m[0];
  s.step = "plan";
  await saveSession(db, s);
  let text = `Assalomu alaykum! <b>AZIMXODJAYEV MUSIC ARENA</b> PRO tarifini tanlang:`;
  if (!s.short) text += `\n\nDasturdagi ID raqamingizni ham yuboring (masalan <code>AZ-4821</code>). U "Sinov tugadi" oynasida yozilgan.`;
  await send(env, msg.chat.id, text, { reply_markup: await tariffKeyboard(db) });
}

async function onPlan(env, cb, planId) {
  const db = env.DB, chatId = cb.message.chat.id;
  await tg(env, "answerCallbackQuery", { callback_query_id: cb.id });
  const st = await getSettings(db);
  const plan = st.tariffs.find((t) => t.id === planId && t.active);
  if (!plan) return send(env, chatId, "Bu tarif hozir mavjud emas.");
  if (!st.card.number) return send(env, chatId, "To'lov kartasi hali sozlanmagan. Iltimos, keyinroq urinib ko'ring.");
  const s = await session(db, cb.from.id);
  s.plan_id = plan.id; s.step = "photo";
  await saveSession(db, s);
  await send(env, chatId, [
    `Tarif: <b>${esc(plan.name)}</b> — <b>${fmtSum(plan.price)}</b>`, ``,
    `Karta: <code>${esc(st.card.number)}</code> (${esc(st.card.system)})`,
    `Egasi: ${esc(st.card.holder)}`,
    s.short ? `Izohga yozing: <code>${esc(s.short)}</code>` : `Izohga dasturdagi ID raqamingizni yozing.`, ``,
    `To'lovdan so'ng <b>chek rasmini</b> (skrinshot) shu yerga yuboring.`,
  ].join("\n"));
}

async function onPhoto(env, msg) {
  const db = env.DB;
  const s = await session(db, msg.from.id);
  if (!s.plan_id) return send(env, msg.chat.id, "Avval tarifni tanlang:", { reply_markup: await tariffKeyboard(db) });
  const isPhoto = !!msg.photo;
  const fileId = isPhoto ? msg.photo[msg.photo.length - 1].file_id : msg.document.file_id;
  const p = await createPayment(db, {
    shortId: s.short, planId: s.plan_id, tgUser: msg.from.id,
    tgUsername: msg.from.username ? "@" + msg.from.username : "",
    tgName: [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" "),
    photo: fileId, photoKind: isPhoto ? "photo" : "document",
  });
  s.step = "wait";
  await saveSession(db, s);
  await send(env, msg.chat.id, "Chekingiz adminga yuborildi. Tasdiqlangach faollashtirish kodi shu yerga keladi.");
  const st = await getSettings(db);
  if (st.bot.autoSend) { await approvePayment(env, p.id, "avto"); return; }
  const chat = await adminChat(db);
  if (chat && st.bot.notify) {
    const caption = [
      `<b>Yangi to'lov</b> · ${esc(p.id)}`,
      `Xaridor: ${esc(p.tg_name)} ${esc(p.tg_username)}`,
      `Dastur ID: <code>${esc(p.short || "ko'rsatilmagan")}</code>`,
      `Tarif: <b>${esc(p.plan_name)}</b> · <b>${fmtSum(p.amount)}</b>`,
      `Kartangizga tushganini tekshiring.`,
    ].join("\n");
    const sent = await tg(env, isPhoto ? "sendPhoto" : "sendDocument", { chat_id: chat, [isPhoto ? "photo" : "document"]: fileId, caption, parse_mode: "HTML", reply_markup: decisionKb(p.id) });
    await db.prepare("UPDATE ar_payments SET admin_chat = ?, admin_msg = ?, admin_caption = ? WHERE id = ?").bind(String(sent.chat.id), sent.message_id, caption, p.id).run();
  }
}

async function onDecision(env, cb, action, id) {
  const chat = await adminChat(env.DB);
  if (!chat || String(cb.message.chat.id) !== chat) return tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Faqat admin uchun" });
  const r = action === "ok" ? await approvePayment(env, id, "telegram") : await rejectPayment(env, id);
  await tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: r.error || (action === "ok" ? "Tasdiqlandi, kod yuborildi" : "Rad etildi") });
}

async function onAdminCommand(env, msg, cmd, arg) {
  const db = env.DB;
  if (cmd === "/kutilayotgan") {
    const list = (await db.prepare("SELECT * FROM ar_payments WHERE status = 'pending' ORDER BY created DESC LIMIT 10").all()).results || [];
    if (!list.length) return send(env, msg.chat.id, "Kutilayotgan to'lov yo'q.");
    for (const p of list) await send(env, msg.chat.id, `${esc(p.id)} · ${esc(p.tg_username || p.tg_name)} · ${esc(p.plan_name)} · ${fmtSum(p.amount)}`, { reply_markup: decisionKb(p.id) });
    return;
  }
  if (cmd === "/kod") {
    const st = await getSettings(db);
    const planId = String(arg || "").trim().toUpperCase();
    if (!st.tariffs.some((t) => t.id === planId)) return send(env, msg.chat.id, "Foydalanish: /kod " + st.tariffs.map((t) => t.id).join(" | "));
    const c = await createCode(db, planId, { createdBy: "telegram" });
    return send(env, msg.chat.id, `Yangi kod (${esc(c.planName)}):\n<code>${c.code}</code>`);
  }
  if (cmd === "/karta") {
    const m = String(arg || "").match(/^([\d\s]{16,23})\s+(.+)$/);
    if (!m) return send(env, msg.chat.id, "Foydalanish: /karta 8600123412341234 Ism Familiya");
    const digits = m[1].replace(/\D/g, "");
    if (digits.length < 16 || digits.length > 19) return send(env, msg.chat.id, "Karta raqami 16 xonali bo'lishi kerak.");
    const st = await getSettings(db);
    st.card = { number: digits.replace(/(.{4})/g, "$1 ").trim(), holder: m[2].trim().slice(0, 60), system: digits.startsWith("9860") ? "HUMO" : digits.startsWith("4") ? "VISA" : digits.startsWith("5") && !digits.startsWith("5614") ? "MASTERCARD" : "UZCARD" };
    await saveSettings(db, st);
    return send(env, msg.chat.id, `Karta saqlandi: <code>${st.card.number}</code> · ${esc(st.card.holder)}`);
  }
  return send(env, msg.chat.id, "Admin buyruqlari:\n/kutilayotgan — tasdiqlanmagan to'lovlar\n/kod 1M — qo'lda kod yaratish\n/karta 8600… Ism — kartani almashtirish");
}

async function handle(env, u) {
  const db = env.DB;
  if (u.callback_query) {
    const cb = u.callback_query;
    const [action, val] = String(cb.data || "").split(":");
    if (action === "plan") return onPlan(env, cb, val);
    if (action === "ok" || action === "no") return onDecision(env, cb, action, val);
    return;
  }
  const msg = u.message;
  if (!msg || !msg.chat || msg.chat.type !== "private" || !msg.from) return;
  const text = (msg.text || "").trim();
  if (text) {
    const [raw, ...rest] = text.split(/\s+/);
    const cmd = raw.split("@")[0].toLowerCase(), arg = rest.join(" ");
    if (cmd === "/id") return send(env, msg.chat.id, `Sizning chat ID: <code>${msg.chat.id}</code>`);
    const linkArg = cmd === "/admin" ? arg.trim() : cmd === "/start" && /^admin_\d{6}$/.test(arg.trim()) ? arg.trim().slice(6) : null;
    if (linkArg !== null) {
      const saved = (await kvGet(db, "admin_link_code")) || "";
      const [code, exp] = saved.split(":");
      if (code && linkArg === code && +exp > Date.now()) {
        const name = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ") || (msg.from.username ? "@" + msg.from.username : String(msg.chat.id));
        await kvSet(db, "admin_chat", String(msg.chat.id));
        await kvSet(db, "admin_chat_name", name);
        await kvSet(db, "admin_link_code", "");
        return send(env, msg.chat.id, "Bog'landi! Endi to'lov cheklari shu yerga Tasdiqlash / Rad etish tugmalari bilan keladi.\n\nBuyruqlar: /kutilayotgan, /kod 1M, /karta");
      }
      return send(env, msg.chat.id, "Kod noto'g'ri yoki muddati o'tgan. Admin sahifada yangi kod oling.");
    }
    if (cmd === "/start") return onStart(env, msg, arg);
    if (cmd.startsWith("/") && String(msg.chat.id) === (await adminChat(db))) return onAdminCommand(env, msg, cmd, arg);
    const m = text.toUpperCase().match(/AZ-\d{4}/);
    if (m) {
      const s = await session(db, msg.from.id);
      s.short = m[0];
      await saveSession(db, s);
      return send(env, msg.chat.id, `ID qabul qilindi: <code>${m[0]}</code>`, s.plan_id ? {} : { reply_markup: await tariffKeyboard(db) });
    }
    return send(env, msg.chat.id, "Boshlash uchun /start bosing yoki chek rasmini yuboring.");
  }
  if (msg.photo || (msg.document && /^image\//.test(msg.document.mime_type || ""))) return onPhoto(env, msg);
}

export const onRequestPost = guard(async ({ request, env }) => {
  const secret = await kvGet(env.DB, "bot_secret");
  if (!secret || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) return json({ error: "forbidden" }, 403);
  const u = await request.json().catch(() => null);
  if (u) {
    try { await handle(env, u); } catch (e) { console.log("bot xatosi:", e && e.message); }
  }
  return json({ ok: true }); // Telegram qayta yubormasligi uchun doim 200
});
