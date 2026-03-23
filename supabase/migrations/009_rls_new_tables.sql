-- RLS for tables from 007_sequences_uploads_inbox.sql

ALTER TABLE sequences            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_sync_state     ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_emails       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON sequences            FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON sequence_enrollments FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON uploads              FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON inbox_sync_state     FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON inbound_emails       FOR ALL USING (auth.uid() IS NOT NULL);
