import { guard, json } from "./_db.js";
import { publicConfig } from "./_arena.js";
export const onRequestGet = guard(async ({ env }) => json(await publicConfig(env.DB)));
