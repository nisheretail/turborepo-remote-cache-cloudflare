import type { Env } from '..';
import { deleteOldCache } from '../crons/deleteOldCache';
import type { ListResult } from '../storage';
import { vValidator } from '@hono/valibot-validator';
import { bearerAuth } from 'hono/bearer-auth';
import { Hono } from 'hono/tiny';
import * as v from 'valibot';

export const internalRouter = new Hono<{ Bindings: Env }>();

internalRouter.use('*', async (c, next) => {
  const middleware = bearerAuth({ token: c.env.TURBO_TOKEN });
  await middleware(c, next);
});

internalRouter.post(
  '/delete-expired-objects',
  vValidator('json', v.object({ expireInHours: v.optional(v.number()) })),
  async (c) => {
    const { expireInHours } = c.req.valid('json');
    await deleteOldCache({
      ...c.env,
      BUCKET_OBJECT_EXPIRATION_HOURS: expireInHours ?? c.env.BUCKET_OBJECT_EXPIRATION_HOURS,
    });
    return c.json({ success: true });
  }
);

internalRouter.post(
  '/populate-random-objects',
  vValidator('json', v.object({ count: v.pipe(v.number(), v.maxValue(1000), v.minValue(1)) })),
  async (c) => {
    const { count } = c.req.valid('json');
    const storage = c.env.STORAGE_MANAGER.getActiveStorage();

    const emojis: string[] = ['🤪', '🤬', '😄', '🥶', '😆', '😅', '😂', '🤣', '😊', '😇'];
    const promises = [];
    for (let i = 0; i < count; i++) {
      const key = `random-data/${crypto.randomUUID()}`;
      promises.push(storage.write(key, emojis[Math.floor(Math.random() * emojis.length)]));
    }
    await Promise.all(promises);

    return c.json({ success: true });
  }
);

internalRouter.get('/count-objects', async (c) => {
  let truncated = false;
  let cursor: string | undefined;
  let list: ListResult;
  let count = 0;
  const storage = c.env.STORAGE_MANAGER.getActiveStorage();
  do {
    list = await storage.list({ limit: 999, cursor });
    truncated = list.truncated;
    cursor = list.truncated ? list.cursor : undefined;
    count += list.keys.length;
  } while (truncated);

  return c.json({ count });
});
