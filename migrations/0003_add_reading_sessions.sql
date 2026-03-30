-- Reading sessions table for daily statistics
CREATE TABLE IF NOT EXISTS reading_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  chars_typed INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  miss_count INTEGER NOT NULL DEFAULT 0,
  reading_time_sec INTEGER NOT NULL DEFAULT 0,
  sessions_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_reading_sessions_user_date ON reading_sessions(user_id, date);
