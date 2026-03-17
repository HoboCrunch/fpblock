-- 003_triggers.sql  –  Automatic timestamps & automation notifications

-- ============================================================
-- updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables that have updated_at
CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_prompt_templates_updated_at
  BEFORE UPDATE ON prompt_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Automation notification trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION notify_automation()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'automation_trigger',
    json_build_object(
      'table', TG_TABLE_NAME,
      'event', TG_OP,
      'id', NEW.id
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables that feed automation rules
CREATE TRIGGER trg_contacts_automation
  AFTER INSERT OR UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION notify_automation();

CREATE TRIGGER trg_companies_automation
  AFTER INSERT OR UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION notify_automation();

CREATE TRIGGER trg_contact_company_automation
  AFTER INSERT OR UPDATE ON contact_company
  FOR EACH ROW EXECUTE FUNCTION notify_automation();
