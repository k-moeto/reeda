import { Hono } from 'hono';
import { authMiddleware } from '../lib/auth-middleware';
import type { Env } from '../types';

const stats = new Hono<Env>();
stats.use('*', authMiddleware);

// Daily stats
stats.get('/daily', async (c) => {
  const userId = c.get('userId');
  const days = parseInt(c.req.query('days') || '30');
  const limit = Math.min(Math.max(1, days), 365);

  const results = await c.env.DB.prepare(`
    SELECT date, chars_typed, correct_count, miss_count, reading_time_sec, sessions_count
    FROM reading_sessions
    WHERE user_id = ? AND date >= date('now', '-' || ? || ' days')
    ORDER BY date ASC
  `).bind(userId, limit).all();

  return c.json({ stats: results.results });
});

// Weekly stats
stats.get('/weekly', async (c) => {
  const userId = c.get('userId');
  const weeks = parseInt(c.req.query('weeks') || '12');
  const days = Math.min(Math.max(1, weeks), 52) * 7;

  const results = await c.env.DB.prepare(`
    SELECT 
      strftime('%Y-W%W', date) as week,
      SUM(chars_typed) as chars_typed,
      SUM(correct_count) as correct_count,
      SUM(miss_count) as miss_count,
      SUM(reading_time_sec) as reading_time_sec,
      SUM(sessions_count) as sessions_count,
      MIN(date) as week_start
    FROM reading_sessions
    WHERE user_id = ? AND date >= date('now', '-' || ? || ' days')
    GROUP BY strftime('%Y-W%W', date)
    ORDER BY week ASC
  `).bind(userId, days).all();

  return c.json({ stats: results.results });
});

// Summary stats
stats.get('/summary', async (c) => {
  const userId = c.get('userId');

  const total = await c.env.DB.prepare(`
    SELECT 
      COALESCE(SUM(chars_typed), 0) as total_chars,
      COALESCE(SUM(correct_count), 0) as total_correct,
      COALESCE(SUM(miss_count), 0) as total_miss,
      COALESCE(SUM(reading_time_sec), 0) as total_time_sec,
      COALESCE(SUM(sessions_count), 0) as total_sessions,
      COUNT(DISTINCT date) as active_days
    FROM reading_sessions
    WHERE user_id = ?
  `).bind(userId).first();

  // Streak calculation
  const days = await c.env.DB.prepare(`
    SELECT date FROM reading_sessions
    WHERE user_id = ? AND chars_typed > 0
    ORDER BY date DESC
  `).bind(userId).all();

  let streak = 0;
  if (days.results.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    const dates = days.results.map((d: any) => d.date);
    let checkDate = today;
    
    // Allow today or yesterday as start
    if (dates.includes(checkDate)) {
      streak = 1;
      for (let i = 1; i < 365; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const ds = d.toISOString().split('T')[0];
        if (dates.includes(ds)) {
          streak++;
        } else {
          break;
        }
      }
    } else {
      // Check if yesterday was active
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      checkDate = yesterday.toISOString().split('T')[0];
      if (dates.includes(checkDate)) {
        streak = 1;
        for (let i = 2; i < 365; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const ds = d.toISOString().split('T')[0];
          if (dates.includes(ds)) {
            streak++;
          } else {
            break;
          }
        }
      }
    }
  }

  return c.json({
    summary: {
      ...total,
      streak,
    },
  });
});

export default stats;
