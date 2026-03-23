ALTER TABLE sequences ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed'));
