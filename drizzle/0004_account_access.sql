ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','master'));
ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1));
CREATE UNIQUE INDEX users_username_unique ON users(username COLLATE NOCASE);
CREATE TABLE login_attempts (key_hash TEXT PRIMARY KEY NOT NULL, attempts INTEGER NOT NULL, window_start INTEGER NOT NULL);
DELETE FROM sessions;
