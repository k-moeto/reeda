import { Hono } from 'hono';
import { hashPassword, verifyPassword, createJWT, generateId } from '../lib/crypto';
import type { Env } from '../types';

const auth = new Hono<Env>();

// Register
auth.post('/register', async (c) => {
  const { email, password, displayName } = await c.req.json<{
    email: string;
    password: string;
    displayName: string;
  }>();

  if (!email || !password || !displayName) {
    return c.json({ error: 'メールアドレス、パスワード、表示名は必須です' }, 400);
  }
  if (password.length < 8) {
    return c.json({ error: 'パスワードは8文字以上にしてください' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) {
    return c.json({ error: 'このメールアドレスは既に登録されています' }, 409);
  }

  const id = generateId();
  const passwordHash = await hashPassword(password);

  await c.env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)'
  ).bind(id, email, passwordHash, displayName).run();

  const secret = c.env.JWT_SECRET || 'reeda-dev-secret-key-change-in-production';
  const token = await createJWT({ userId: id }, secret);

  c.header('Set-Cookie', `reeda_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
  return c.json({ user: { id, email, displayName } });
});

// Login
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();

  if (!email || !password) {
    return c.json({ error: 'メールアドレスとパスワードを入力してください' }, 400);
  }

  const user = await c.env.DB.prepare(
    'SELECT id, email, password_hash, display_name FROM users WHERE email = ?'
  ).bind(email).first<{ id: string; email: string; password_hash: string; display_name: string }>();

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: 'メールアドレスまたはパスワードが正しくありません' }, 401);
  }

  const secret = c.env.JWT_SECRET || 'reeda-dev-secret-key-change-in-production';
  const token = await createJWT({ userId: user.id }, secret);

  c.header('Set-Cookie', `reeda_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
  return c.json({ user: { id: user.id, email: user.email, displayName: user.display_name } });
});

// Logout
auth.post('/logout', (c) => {
  c.header('Set-Cookie', 'reeda_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  return c.json({ ok: true });
});

// Get current user
auth.get('/me', async (c) => {
  const cookie = c.req.header('Cookie') || '';
  const match = cookie.match(/reeda_token=([^;]+)/);
  if (!match) return c.json({ user: null });

  const { verifyJWT } = await import('../lib/crypto');
  const secret = c.env.JWT_SECRET || 'reeda-dev-secret-key-change-in-production';
  const payload = await verifyJWT(match[1], secret);
  if (!payload || !payload.userId) return c.json({ user: null });

  const user = await c.env.DB.prepare(
    'SELECT id, email, display_name FROM users WHERE id = ?'
  ).bind(payload.userId).first<{ id: string; email: string; display_name: string }>();

  if (!user) return c.json({ user: null });
  return c.json({ user: { id: user.id, email: user.email, displayName: user.display_name } });
});

export default auth;
