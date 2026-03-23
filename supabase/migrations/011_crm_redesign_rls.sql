-- 011_crm_redesign_rls.sql
-- Authenticated full access on all new tables (single-tenant trusted team)

ALTER TABLE persons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON persons FOR ALL USING (auth.uid() IS NOT NULL);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON organizations FOR ALL USING (auth.uid() IS NOT NULL);

ALTER TABLE person_organization ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON person_organization FOR ALL USING (auth.uid() IS NOT NULL);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON events FOR ALL USING (auth.uid() IS NOT NULL);

ALTER TABLE event_participations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON event_participations FOR ALL USING (auth.uid() IS NOT NULL);

ALTER TABLE initiatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON initiatives FOR ALL USING (auth.uid() IS NOT NULL);

ALTER TABLE initiative_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON initiative_enrollments FOR ALL USING (auth.uid() IS NOT NULL);

ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON interactions FOR ALL USING (auth.uid() IS NOT NULL);

ALTER TABLE correlation_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON correlation_candidates FOR ALL USING (auth.uid() IS NOT NULL);
