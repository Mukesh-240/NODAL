-- ─── NODAL Community Tables Migration ────────────────────────────────────────
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- These two tables power the /community board: upvotes + threaded comments.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── TABLE: issue_upvotes ─────────────────────────────────────────────────────
-- One row per (issue, session). Soft-deduplicates reports — students +1 instead
-- of filing duplicate tickets. Upvote count auto-boosts issue priority display.
CREATE TABLE IF NOT EXISTS issue_upvotes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  issue_id    UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  session_id  TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (issue_id, session_id)   -- one upvote per session per issue
);

CREATE INDEX IF NOT EXISTS idx_upvotes_issue   ON issue_upvotes (issue_id);
CREATE INDEX IF NOT EXISTS idx_upvotes_session ON issue_upvotes (session_id);

-- ── TABLE: issue_comments ─────────────────────────────────────────────────────
-- Threaded discussion on each issue. Students add updates, observations, or
-- confirmations that an issue has been fixed. Body capped at 500 chars.
CREATE TABLE IF NOT EXISTS issue_comments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  issue_id      UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  session_id    TEXT NOT NULL,
  display_name  TEXT DEFAULT 'Anonymous Student',
  body          TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_issue ON issue_comments (issue_id);

-- ── RLS Policies ─────────────────────────────────────────────────────────────
ALTER TABLE issue_upvotes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_comments ENABLE ROW LEVEL SECURITY;

-- Anyone (logged-in or anon) can read upvotes and comments
CREATE POLICY "Public read upvotes"
  ON issue_upvotes FOR SELECT USING (true);

CREATE POLICY "Service role insert upvotes"
  ON issue_upvotes FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role delete upvotes"
  ON issue_upvotes FOR DELETE USING (auth.role() = 'service_role');

CREATE POLICY "Public read comments"
  ON issue_comments FOR SELECT USING (true);

CREATE POLICY "Service role insert comments"
  ON issue_comments FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- After running this, your /community board will have live upvotes + comments.
-- ─────────────────────────────────────────────────────────────────────────────
