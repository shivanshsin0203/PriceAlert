import type { Condition } from "../brain/schema";
import { plog } from "../lib/logger";
import { redis } from "./redis";

// The hot mirror of `alerts WHERE status='active'` (ARCHITECTURE.md §9).
// active_alerts = SET of alert uuids · alert:{id} = HASH with everything a tick needs.
// Postgres is truth; anything here must be rebuildable from it (rehydrate lives in alert.service).

export type HotAlert = {
  id: string; // alerts.id (uuid)
  userId: string;
  chatId: number | null; // null = owner has no Telegram link (in-app delivery only)
  condition: Condition;
  anchorPrice: number;
  createdAt: number; // ms epoch
  expiresAt: number; // ms epoch
};

const SET_KEY = "active_alerts";
const key = (id: string) => `alert:${id}`;

export async function addActive(a: HotAlert): Promise<void> {
  await redis
    .multi()
    .sadd(SET_KEY, a.id)
    .hset(key(a.id), {
      id: a.id,
      userId: a.userId,
      chatId: a.chatId == null ? "" : String(a.chatId), // "" = no telegram link
      condition: JSON.stringify(a.condition),
      anchorPrice: String(a.anchorPrice),
      createdAt: String(a.createdAt),
      expiresAt: String(a.expiresAt),
    })
    .exec();
}

export async function removeActive(id: string): Promise<void> {
  await redis.multi().srem(SET_KEY, id).del(key(id)).exec();
}

export const activeCount = () => redis.scard(SET_KEY);

// SMEMBERS + pipelined HGETALL. Ids whose hash is missing (e.g. Redis flush between
// SADD and HSET, or manual fiddling) come back in `missing` so the tick can heal them from PG.
export async function getActive(): Promise<{ alerts: HotAlert[]; missing: string[] }> {
  const ids = await redis.smembers(SET_KEY);
  if (ids.length === 0) return { alerts: [], missing: [] };

  const pipe = redis.pipeline();
  for (const id of ids) pipe.hgetall(key(id));
  const res = (await pipe.exec()) ?? [];

  const alerts: HotAlert[] = [];
  const missing: string[] = [];
  ids.forEach((id, i) => {
    const h = res[i]?.[1] as Record<string, string> | undefined;
    if (!h || !h.condition) {
      missing.push(id);
      return;
    }
    try {
      alerts.push({
        id,
        userId: h.userId,
        chatId: h.chatId ? Number(h.chatId) : null,
        condition: JSON.parse(h.condition) as Condition,
        anchorPrice: Number(h.anchorPrice),
        createdAt: Number(h.createdAt),
        expiresAt: Number(h.expiresAt),
      });
    } catch {
      plog.warn(`active: corrupt hash for ${id} — will heal from PG`);
      missing.push(id);
    }
  });
  return { alerts, missing };
}
