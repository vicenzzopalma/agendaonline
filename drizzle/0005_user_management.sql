-- Usernames identify accounts; optional e-mail addresses may be empty.
DROP INDEX IF EXISTS users_email_unique;
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE TABLE user_account_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  recorded_at INTEGER NOT NULL,
  snapshot TEXT NOT NULL
);
