-- Enrichment status tracking for organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS enrichment_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS enrichment_stages jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_enriched_at timestamptz;

-- Enrichment status tracking for persons
ALTER TABLE persons
  ADD COLUMN IF NOT EXISTS enrichment_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS last_enriched_at timestamptz;

-- Index for filtering by enrichment status
CREATE INDEX IF NOT EXISTS idx_organizations_enrichment_status ON organizations (enrichment_status);
CREATE INDEX IF NOT EXISTS idx_persons_enrichment_status ON persons (enrichment_status);

-- Backfill: orgs that already have icp_score are considered fully enriched
UPDATE organizations
SET enrichment_status = 'complete',
    last_enriched_at = updated_at
WHERE icp_score IS NOT NULL
  AND enrichment_status = 'none';

-- Backfill: persons that already have apollo_id are considered enriched
UPDATE persons
SET enrichment_status = 'complete',
    last_enriched_at = updated_at
WHERE apollo_id IS NOT NULL
  AND enrichment_status = 'none';
