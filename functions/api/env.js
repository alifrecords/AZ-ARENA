// Dastur uchun ochiq kalit: litsenziya imzosini kompyuterning o'zida (oflayn) tekshirish.
import { guard, edKeys } from "./_db.js";
export const onRequestGet = guard(async ({ env }) => {
  const { pub } = await edKeys(env.DB);
  return new Response("window.AZ_ENV = " + JSON.stringify({ pubKey: pub }) + ";", {
    headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" },
  });
});
