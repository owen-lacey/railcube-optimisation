-- One row per physical track: the first to submit it owns it (track_hash is
-- UNIQUE). The readings and score are the Worker's own, from `assess`, never the
-- browser's. Notes are private: nothing the Worker serves reads them.
CREATE TABLE submissions (
  id INTEGER PRIMARY KEY,
  shape TEXT NOT NULL,
  track_hash TEXT NOT NULL UNIQUE,
  score INTEGER NOT NULL,
  knotted INTEGER NOT NULL,
  poses INTEGER NOT NULL,
  close_calls INTEGER NOT NULL,
  repeats INTEGER NOT NULL,
  longest_side INTEGER NOT NULL,
  notes TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX submissions_by_score ON submissions (score DESC, id);
