-- 027_person_lists_filter_rules.sql
-- Optional saved filter for a person_list. Null = manual list (no saved filter).

ALTER TABLE person_lists
  ADD COLUMN IF NOT EXISTS filter_rules jsonb;

COMMENT ON COLUMN person_lists.filter_rules IS
  'Optional saved PersonFilterRules used by /admin/lists/[id] to grow the list. Membership remains in person_list_items.';
