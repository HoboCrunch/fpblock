-- 013_crm_drop_old_tables.sql
-- Drop old tables after data has been seeded into new schema
-- Run AFTER seed-crm.ts has been executed successfully

-- Drop junction tables first (they reference the core tables)
DROP TABLE IF EXISTS contact_event CASCADE;
DROP TABLE IF EXISTS company_event CASCADE;
DROP TABLE IF EXISTS contact_company CASCADE;

-- Drop core tables
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS events_old CASCADE;
