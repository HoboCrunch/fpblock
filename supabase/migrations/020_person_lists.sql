-- 020_person_lists.sql
-- Saved person lists for targeting in enrichment, sequences, and initiatives

CREATE TABLE IF NOT EXISTS person_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_person_lists_updated_at
  BEFORE UPDATE ON person_lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS person_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES person_lists(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(list_id, person_id)
);

CREATE INDEX idx_person_list_items_list ON person_list_items(list_id);
CREATE INDEX idx_person_list_items_person ON person_list_items(person_id);

-- RLS
ALTER TABLE person_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON person_lists FOR ALL USING (auth.uid() IS NOT NULL);

ALTER TABLE person_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON person_list_items FOR ALL USING (auth.uid() IS NOT NULL);
