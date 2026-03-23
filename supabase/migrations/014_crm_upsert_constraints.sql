-- 014_crm_upsert_constraints.sql
-- Add unique constraints needed for PostgREST upsert operations

-- Organizations: unique on name for upsert by name
ALTER TABLE organizations ADD CONSTRAINT organizations_name_unique UNIQUE (name);

-- Persons: unique on full_name for upsert dedup (best-effort, names can collide but rare in this dataset)
-- Not adding this — persons are inserted, not upserted. Correlation handles dedup.

-- Fix correlation function: replace invalid jsonb - jsonb operator with array filtering
CREATE OR REPLACE FUNCTION find_person_correlations(p_person_id uuid)
RETURNS TABLE (
  target_id uuid,
  confidence float,
  match_reasons jsonb
) AS $$
DECLARE
  p_record RECORD;
BEGIN
  SELECT * INTO p_record FROM persons WHERE id = p_person_id;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    existing.id AS target_id,
    GREATEST(
      CASE WHEN p_record.email IS NOT NULL AND existing.email IS NOT NULL
           AND lower(p_record.email) = lower(existing.email) THEN 0.98 ELSE 0.0 END,
      CASE WHEN p_record.linkedin_url IS NOT NULL AND existing.linkedin_url IS NOT NULL
           AND lower(p_record.linkedin_url) = lower(existing.linkedin_url) THEN 0.97 ELSE 0.0 END,
      CASE WHEN p_record.twitter_handle IS NOT NULL AND existing.twitter_handle IS NOT NULL
           AND lower(p_record.twitter_handle) = lower(existing.twitter_handle) THEN 0.96 ELSE 0.0 END,
      similarity(p_record.full_name, existing.full_name)
    ) AS confidence,
    (SELECT jsonb_agg(elem) FROM (
      SELECT unnest(ARRAY[
        CASE WHEN p_record.email IS NOT NULL AND existing.email IS NOT NULL
             AND lower(p_record.email) = lower(existing.email) THEN 'exact_email' END,
        CASE WHEN p_record.linkedin_url IS NOT NULL AND existing.linkedin_url IS NOT NULL
             AND lower(p_record.linkedin_url) = lower(existing.linkedin_url) THEN 'exact_linkedin' END,
        CASE WHEN p_record.twitter_handle IS NOT NULL AND existing.twitter_handle IS NOT NULL
             AND lower(p_record.twitter_handle) = lower(existing.twitter_handle) THEN 'exact_twitter' END,
        CASE WHEN similarity(p_record.full_name, existing.full_name) >= 0.6
             THEN 'similar_name:' || round(similarity(p_record.full_name, existing.full_name)::numeric, 2)::text END
      ]) AS elem
      WHERE unnest IS NOT NULL
    ) sub) AS match_reasons
  FROM persons existing
  WHERE existing.id != p_person_id
    AND (
      (p_record.email IS NOT NULL AND lower(existing.email) = lower(p_record.email))
      OR (p_record.linkedin_url IS NOT NULL AND lower(existing.linkedin_url) = lower(p_record.linkedin_url))
      OR (p_record.twitter_handle IS NOT NULL AND lower(existing.twitter_handle) = lower(p_record.twitter_handle))
      OR similarity(p_record.full_name, existing.full_name) >= 0.6
    );
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION find_org_correlations(p_org_id uuid)
RETURNS TABLE (
  target_id uuid,
  confidence float,
  match_reasons jsonb
) AS $$
DECLARE
  p_record RECORD;
BEGIN
  SELECT * INTO p_record FROM organizations WHERE id = p_org_id;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    existing.id AS target_id,
    GREATEST(
      CASE WHEN p_record.website IS NOT NULL AND existing.website IS NOT NULL
           AND lower(p_record.website) = lower(existing.website) THEN 0.98 ELSE 0.0 END,
      CASE WHEN p_record.linkedin_url IS NOT NULL AND existing.linkedin_url IS NOT NULL
           AND lower(p_record.linkedin_url) = lower(existing.linkedin_url) THEN 0.97 ELSE 0.0 END,
      similarity(p_record.name, existing.name)
    ) AS confidence,
    (SELECT jsonb_agg(elem) FROM (
      SELECT unnest(ARRAY[
        CASE WHEN p_record.website IS NOT NULL AND existing.website IS NOT NULL
             AND lower(p_record.website) = lower(existing.website) THEN 'exact_website' END,
        CASE WHEN p_record.linkedin_url IS NOT NULL AND existing.linkedin_url IS NOT NULL
             AND lower(p_record.linkedin_url) = lower(existing.linkedin_url) THEN 'exact_linkedin' END,
        CASE WHEN similarity(p_record.name, existing.name) >= 0.6
             THEN 'similar_name:' || round(similarity(p_record.name, existing.name)::numeric, 2)::text END
      ]) AS elem
      WHERE unnest IS NOT NULL
    ) sub) AS match_reasons
  FROM organizations existing
  WHERE existing.id != p_org_id
    AND (
      (p_record.website IS NOT NULL AND lower(existing.website) = lower(p_record.website))
      OR (p_record.linkedin_url IS NOT NULL AND lower(existing.linkedin_url) = lower(p_record.linkedin_url))
      OR similarity(p_record.name, existing.name) >= 0.6
    );
END;
$$ LANGUAGE plpgsql STABLE;
