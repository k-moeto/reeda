import { Hono } from 'hono';
import { generateId } from '../lib/crypto';
import { authMiddleware } from '../lib/auth-middleware';
import type { Env } from '../types';

const ANALYZER_URL = 'http://127.0.0.1:3001/analyze';

const documents = new Hono<Env>();
documents.use('*', authMiddleware);

// Analyze text via the morphological analysis micro-server
async function analyzeText(text: string): Promise<any[]> {
  try {
    const res = await fetch(ANALYZER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.error('Analyzer error:', res.status, await res.text());
      return [];
    }
    const data = await res.json() as { segments: any[] };
    return data.segments || [];
  } catch (err) {
    console.error('Failed to reach analyzer server:', err);
    return [];
  }
}

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

  // Analyze text server-side using kuromoji micro-server
  const segments = await analyzeText(content);
  const segmentsJson = segments.length > 0 ? JSON.stringify(segments) : null;

  await c.env.DB.prepare(
    'INSERT INTO documents (id, user_id, title, content, source_type, total_chars, segments) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, userId, title, content, sourceType || 'txt', totalChars, segmentsJson).run();

  // Create initial progress record
  const progressId = generateId();
  await c.env.DB.prepare(
    'INSERT INTO reading_progress (id, document_id, user_id) VALUES (?, ?, ?)'
  ).bind(progressId, id, userId).run();

  return c.json({ document: { id, title, sourceType, totalChars, hasSegments: segments.length > 0 } }, 201);
});

// Import from URL
documents.post('/import-url', async (c) => {
  const userId = c.get('userId');
  const { url } = await c.req.json<{ url: string }>();

  if (!url || !/^https?:\/\/.+/.test(url)) {
    return c.json({ error: '有効なURLを入力してください' }, 400);
  }

  try {
    // Fetch the page
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Reeda/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!res.ok) {
      return c.json({ error: `ページの取得に失敗しました (${res.status})` }, 400);
    }

    const html = await res.text();

    // Extract title from <title> tag
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    let title = titleMatch ? titleMatch[1].trim() : new URL(url).hostname;
    // Clean up common title patterns like "Title | SiteName"
    title = title.replace(/\s*[|\-–—]\s*[^|\-–—]+$/, '').trim() || title;

    // Extract text content from HTML
    const content = extractTextFromHtml(html);

    if (!content || content.length < 10) {
      return c.json({ error: 'テキストを抽出できませんでした' }, 400);
    }

    return c.json({ title, content, sourceType: 'url' });
  } catch (err: any) {
    console.error('URL import error:', err);
    return c.json({ error: 'URLの取得に失敗しました: ' + (err.message || '不明なエラー') }, 500);
  }
});

function extractTextFromHtml(html: string): string {
  // Remove script, style, nav, header, footer, aside, form tags and their content
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Try to find <article> or <main> content first
  let articleMatch = cleaned.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  if (!articleMatch) {
    articleMatch = cleaned.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
  }
  
  const source = articleMatch ? articleMatch[1] : cleaned;

  // Replace block-level tags with newlines
  let text = source
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/blockquote>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '') // Remove all remaining tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&[a-zA-Z]+;/gi, '')
    .replace(/&#\d+;/gi, '');

  // Normalize whitespace
  text = text
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');

  return text.trim();
}

// List documents
documents.get('/', async (c) => {
  const userId = c.get('userId');
  const results = await c.env.DB.prepare(`
    SELECT d.id, d.title, d.source_type, d.total_chars, d.created_at,
           d.segments IS NOT NULL as has_segments,
           rp.current_position, rp.completed, rp.last_read_at,
           rp.correct_count, rp.miss_count, rp.reading_time_sec
    FROM documents d
    LEFT JOIN reading_progress rp ON d.id = rp.document_id AND rp.user_id = ?
    WHERE d.user_id = ?
    ORDER BY COALESCE(rp.last_read_at, d.created_at) DESC
  `).bind(userId, userId).all();

  return c.json({ documents: results.results });
});

// Get single document with content and segments
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

  // Parse segments from JSON if available
  let segments = null;
  if (doc.segments) {
    try {
      segments = JSON.parse(doc.segments as string);
    } catch {
      segments = null;
    }
  }

  return c.json({ 
    document: { ...doc, segments: undefined },
    segments,
    progress, 
    bookmarks: bookmarks.results 
  });
});

// Re-analyze a document (in case segments were not generated on creation)
documents.post('/:id/analyze', async (c) => {
  const userId = c.get('userId');
  const docId = c.req.param('id');

  const doc = await c.env.DB.prepare(
    'SELECT id, content FROM documents WHERE id = ? AND user_id = ?'
  ).bind(docId, userId).first();

  if (!doc) return c.json({ error: 'ドキュメントが見つかりません' }, 404);

  const segments = await analyzeText(doc.content as string);
  if (segments.length === 0) {
    return c.json({ error: '形態素解析に失敗しました。解析サーバーが起動しているか確認してください。' }, 500);
  }

  await c.env.DB.prepare(
    'UPDATE documents SET segments = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).bind(JSON.stringify(segments), docId).run();

  return c.json({ ok: true, segmentCount: segments.length });
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

  // Get previous progress to calculate delta
  const prev = await c.env.DB.prepare(
    'SELECT correct_count, miss_count, reading_time_sec, total_typed FROM reading_progress WHERE document_id = ? AND user_id = ?'
  ).bind(docId, userId).first<{correct_count: number; miss_count: number; reading_time_sec: number; total_typed: number}>();

  await c.env.DB.prepare(`
    UPDATE reading_progress
    SET current_position = ?, total_typed = ?, correct_count = ?, miss_count = ?,
        reading_time_sec = ?, completed = ?, last_read_at = datetime('now'), updated_at = datetime('now')
    WHERE document_id = ? AND user_id = ?
  `).bind(currentPosition, totalTyped, correctCount, missCount, readingTimeSec, completed ? 1 : 0, docId, userId).run();

  // Update daily reading session stats (delta-based)
  const deltaCorrect = Math.max(0, correctCount - (prev?.correct_count || 0));
  const deltaMiss = Math.max(0, missCount - (prev?.miss_count || 0));
  const deltaTime = Math.max(0, readingTimeSec - (prev?.reading_time_sec || 0));
  const deltaTyped = Math.max(0, totalTyped - (prev?.total_typed || 0));

  if (deltaTyped > 0 || deltaTime > 0) {
    const today = new Date().toISOString().split('T')[0];
    const sessionId = generateId();
    await c.env.DB.prepare(`
      INSERT INTO reading_sessions (id, user_id, date, chars_typed, correct_count, miss_count, reading_time_sec, sessions_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(user_id, date) DO UPDATE SET
        chars_typed = chars_typed + excluded.chars_typed,
        correct_count = correct_count + excluded.correct_count,
        miss_count = miss_count + excluded.miss_count,
        reading_time_sec = reading_time_sec + excluded.reading_time_sec,
        sessions_count = sessions_count + 1,
        updated_at = datetime('now')
    `).bind(sessionId, userId, today, deltaTyped, deltaCorrect, deltaMiss, deltaTime).run();
  }

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
