import { Hono } from 'hono';
import { generateId } from '../lib/crypto';
import { authMiddleware } from '../lib/auth-middleware';
import type { Env } from '../types';

const documents = new Hono<Env>();
documents.use('*', authMiddleware);

// Create document
documents.post('/', async (c) => {
  const userId = c.get('userId');
  const { title, content, sourceType } = await c.req.json<{
    title: string;
    content: string;
    sourceType: string;
  }>();

  if (!title || !content) {
    return c.json({ error: 'タイトルと内容は必須です' }, 400);
  }

  const id = generateId();
  const totalChars = content.length;

  await c.env.DB.prepare(
    'INSERT INTO documents (id, user_id, title, content, source_type, total_chars) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, userId, title, content, sourceType || 'txt', totalChars).run();

  // Create initial progress record
  const progressId = generateId();
  await c.env.DB.prepare(
    'INSERT INTO reading_progress (id, document_id, user_id) VALUES (?, ?, ?)'
  ).bind(progressId, id, userId).run();

  return c.json({ document: { id, title, sourceType, totalChars } }, 201);
});

// List documents
documents.get('/', async (c) => {
  const userId = c.get('userId');
  const results = await c.env.DB.prepare(`
    SELECT d.id, d.title, d.source_type, d.total_chars, d.created_at,
           rp.current_position, rp.completed, rp.last_read_at,
           rp.correct_count, rp.miss_count, rp.reading_time_sec
    FROM documents d
    LEFT JOIN reading_progress rp ON d.id = rp.document_id AND rp.user_id = ?
    WHERE d.user_id = ?
    ORDER BY COALESCE(rp.last_read_at, d.created_at) DESC
  `).bind(userId, userId).all();

  return c.json({ documents: results.results });
});

// Get single document with content
documents.get('/:id', async (c) => {
  const userId = c.get('userId');
  const docId = c.req.param('id');

  const doc = await c.env.DB.prepare(
    'SELECT * FROM documents WHERE id = ? AND user_id = ?'
  ).bind(docId, userId).first();

  if (!doc) return c.json({ error: 'ドキュメントが見つかりません' }, 404);

  const progress = await c.env.DB.prepare(
    'SELECT * FROM reading_progress WHERE document_id = ? AND user_id = ?'
  ).bind(docId, userId).first();

  const bookmarks = await c.env.DB.prepare(
    'SELECT * FROM bookmarks WHERE document_id = ? AND user_id = ? ORDER BY position ASC'
  ).bind(docId, userId).all();

  return c.json({ document: doc, progress, bookmarks: bookmarks.results });
});

// Delete document
documents.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const docId = c.req.param('id');

  await c.env.DB.prepare(
    'DELETE FROM documents WHERE id = ? AND user_id = ?'
  ).bind(docId, userId).run();

  return c.json({ ok: true });
});

// Update progress
documents.put('/:id/progress', async (c) => {
  const userId = c.get('userId');
  const docId = c.req.param('id');
  const { currentPosition, totalTyped, correctCount, missCount, readingTimeSec, completed } = await c.req.json<{
    currentPosition: number;
    totalTyped: number;
    correctCount: number;
    missCount: number;
    readingTimeSec: number;
    completed: boolean;
  }>();

  await c.env.DB.prepare(`
    UPDATE reading_progress
    SET current_position = ?, total_typed = ?, correct_count = ?, miss_count = ?,
        reading_time_sec = ?, completed = ?, last_read_at = datetime('now'), updated_at = datetime('now')
    WHERE document_id = ? AND user_id = ?
  `).bind(currentPosition, totalTyped, correctCount, missCount, readingTimeSec, completed ? 1 : 0, docId, userId).run();

  return c.json({ ok: true });
});

// Add bookmark
documents.post('/:id/bookmarks', async (c) => {
  const userId = c.get('userId');
  const docId = c.req.param('id');
  const { position, note } = await c.req.json<{ position: number; note?: string }>();

  const id = generateId();
  await c.env.DB.prepare(
    'INSERT INTO bookmarks (id, document_id, user_id, position, note) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, docId, userId, position, note || '').run();

  return c.json({ bookmark: { id, position, note } }, 201);
});

// Delete bookmark
documents.delete('/:id/bookmarks/:bookmarkId', async (c) => {
  const userId = c.get('userId');
  const bookmarkId = c.req.param('bookmarkId');

  await c.env.DB.prepare(
    'DELETE FROM bookmarks WHERE id = ? AND user_id = ?'
  ).bind(bookmarkId, userId).run();

  return c.json({ ok: true });
});

export default documents;
