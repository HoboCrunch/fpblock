-- Add firmographic columns to organizations so enrichment data lives on the row
-- instead of being buried in job_log metadata.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS employee_count int;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS annual_revenue text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS founded_year int;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS hq_location text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS funding_total text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS latest_funding_stage text;

CREATE INDEX IF NOT EXISTS idx_organizations_industry ON organizations (industry);
CREATE INDEX IF NOT EXISTS idx_organizations_employee_count ON organizations (employee_count);
