-- 002_rls.sql  –  Row-Level Security policies

-- Enable RLS on every table
ALTER TABLE contacts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sender_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_signals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_company   ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_event     ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_event     ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_log           ENABLE ROW LEVEL SECURITY;

-- Authenticated full access policy for each table
CREATE POLICY "Authenticated full access" ON contacts          FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON companies         FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON events            FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON sender_profiles   FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON prompt_templates  FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON event_config      FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON messages          FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON company_signals   FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON contact_company   FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON contact_event     FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON company_event     FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON automation_rules  FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON job_log           FOR ALL USING (auth.uid() IS NOT NULL);
