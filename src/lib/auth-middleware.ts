import { createMiddleware } from 'hono/factory';
import { verifyJWT } from './crypto';
import type { Env } from '../types';

export const authMiddleware = createMiddleware<Env>(async (c, next) => {
  const cookie = c.req.header('Cookie') || '';
  const match = cookie.match(/reeda_token=([^;]+)/);
  if (!match) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const secret = c.env.JWT_SECRET || 'reeda-dev-secret-key-change-in-production';
  const payload = await verifyJWT(match[1], secret);
  if (!payload || !payload.userId) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  c.set('userId', payload.userId as string);
  await next();
});
