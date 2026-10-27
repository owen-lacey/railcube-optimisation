-- A track goes on the board the moment its loop closes, unnamed, and its builder
-- names it afterwards. Only the browser that submitted it holds the token that
-- may; the token is stored hashed. The name is public, unlike the notes.
ALTER TABLE submissions ADD COLUMN name TEXT;
ALTER TABLE submissions ADD COLUMN token_hash TEXT;
