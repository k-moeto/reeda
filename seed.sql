-- Test user (password: "test1234" hashed with PBKDF2)
-- This is only for local development seeding
INSERT OR IGNORE INTO users (id, email, password_hash, display_name)
VALUES ('test-user-001', 'test@reeda.app', 'dev-seed-only', 'テストユーザー');
