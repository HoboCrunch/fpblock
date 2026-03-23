-- 012_crm_redesign_functions.sql

-- updated_at trigger function (reuse existing or create)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to new tables
CREATE TRIGGER trg_persons_updated_at BEFORE UPDATE ON persons FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_person_org_updated_at BEFORE UPDATE ON person_organization FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_initiatives_updated_at BEFORE UPDATE ON initiatives FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_interactions_updated_at BEFORE UPDATE ON interactions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- persons_with_icp VIEW
-- ============================================
-- Exposes ICP score from primary org affiliation as a sortable column on persons
CREATE OR REPLACE VIEW persons_with_icp AS
SELECT
  p.*,
  o.name AS primary_org_name,
  o.icp_score,
  o.icp_reason,
  o.category AS org_category,
  po.role AS org_role
FROM persons p
LEFT JOIN person_organization po ON po.person_id = p.id AND po.is_primary = true
LEFT JOIN organizations o ON o.id = po.organization_id;

-- ============================================
-- interaction_status_counts RPC (replaces message_status_counts)
-- ============================================
CREATE OR REPLACE FUNCTION interaction_status_counts()
RETURNS TABLE (status text, count bigint) AS $$
  SELECT status, count(*)::bigint
  FROM interactions
  WHERE status IS NOT NULL
  GROUP BY status;
$$ LANGUAGE sql STABLE;

-- ============================================
-- find_correlations() — fuzzy matching function
-- ============================================
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
      -- Exact email match = 0.98
      CASE WHEN p_record.email IS NOT NULL AND existing.email IS NOT NULL
           AND lower(p_record.email) = lower(existing.email) THEN 0.98 ELSE 0.0 END,
      -- Exact LinkedIn match = 0.97
      CASE WHEN p_record.linkedin_url IS NOT NULL AND existing.linkedin_url IS NOT NULL
           AND lower(p_record.linkedin_url) = lower(existing.linkedin_url) THEN 0.97 ELSE 0.0 END,
      -- Exact Twitter match = 0.96
      CASE WHEN p_record.twitter_handle IS NOT NULL AND existing.twitter_handle IS NOT NULL
           AND lower(p_record.twitter_handle) = lower(existing.twitter_handle) THEN 0.96 ELSE 0.0 END,
      -- Fuzzy name similarity
      similarity(p_record.full_name, existing.full_name)
    ) AS confidence,
    jsonb_build_array(
      CASE WHEN p_record.email IS NOT NULL AND existing.email IS NOT NULL
           AND lower(p_record.email) = lower(existing.email) THEN 'exact_email' END,
      CASE WHEN p_record.linkedin_url IS NOT NULL AND existing.linkedin_url IS NOT NULL
           AND lower(p_record.linkedin_url) = lower(existing.linkedin_url) THEN 'exact_linkedin' END,
      CASE WHEN p_record.twitter_handle IS NOT NULL AND existing.twitter_handle IS NOT NULL
           AND lower(p_record.twitter_handle) = lower(existing.twitter_handle) THEN 'exact_twitter' END,
      CASE WHEN similarity(p_record.full_name, existing.full_name) >= 0.6
           THEN 'similar_name:' || round(similarity(p_record.full_name, existing.full_name)::numeric, 2)::text END
    ) - 'null'::jsonb AS match_reasons
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

-- Similar function for organizations
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
    jsonb_build_array(
      CASE WHEN p_record.website IS NOT NULL AND existing.website IS NOT NULL
           AND lower(p_record.website) = lower(existing.website) THEN 'exact_website' END,
      CASE WHEN p_record.linkedin_url IS NOT NULL AND existing.linkedin_url IS NOT NULL
           AND lower(p_record.linkedin_url) = lower(existing.linkedin_url) THEN 'exact_linkedin' END,
      CASE WHEN similarity(p_record.name, existing.name) >= 0.6
           THEN 'similar_name:' || round(similarity(p_record.name, existing.name)::numeric, 2)::text END
    ) - 'null'::jsonb AS match_reasons
  FROM organizations existing
  WHERE existing.id != p_org_id
    AND (
      (p_record.website IS NOT NULL AND lower(existing.website) = lower(p_record.website))
      OR (p_record.linkedin_url IS NOT NULL AND lower(existing.linkedin_url) = lower(p_record.linkedin_url))
      OR similarity(p_record.name, existing.name) >= 0.6
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- merge_persons() — merge two person records
-- ============================================
CREATE OR REPLACE FUNCTION merge_persons(winner_id uuid, loser_id uuid)
RETURNS void AS $$
BEGIN
  -- Reassign relationships
  UPDATE person_organization SET person_id = winner_id WHERE person_id = loser_id
    ON CONFLICT (person_id, organization_id) DO NOTHING;
  UPDATE event_participations SET person_id = winner_id WHERE person_id = loser_id;
  UPDATE initiative_enrollments SET person_id = winner_id WHERE person_id = loser_id;
  UPDATE interactions SET person_id = winner_id WHERE person_id = loser_id;
  UPDATE sequence_enrollments SET person_id = winner_id WHERE person_id = loser_id;
  UPDATE inbound_emails SET person_id = winner_id WHERE person_id = loser_id;

  -- Fill null fields on winner from loser
  UPDATE persons SET
    email = COALESCE(persons.email, l.email),
    linkedin_url = COALESCE(persons.linkedin_url, l.linkedin_url),
    twitter_handle = COALESCE(persons.twitter_handle, l.twitter_handle),
    telegram_handle = COALESCE(persons.telegram_handle, l.telegram_handle),
    phone = COALESCE(persons.phone, l.phone),
    title = COALESCE(persons.title, l.title),
    bio = COALESCE(persons.bio, l.bio),
    photo_url = COALESCE(persons.photo_url, l.photo_url),
    apollo_id = COALESCE(persons.apollo_id, l.apollo_id)
  FROM persons l
  WHERE persons.id = winner_id AND l.id = loser_id;

  -- Clean up correlation candidates
  DELETE FROM correlation_candidates WHERE source_id = loser_id OR target_id = loser_id;

  -- Delete loser
  DELETE FROM persons WHERE id = loser_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- merge_organizations() — merge two org records
-- ============================================
CREATE OR REPLACE FUNCTION merge_organizations(winner_id uuid, loser_id uuid)
RETURNS void AS $$
BEGIN
  -- Reassign relationships
  UPDATE person_organization SET organization_id = winner_id WHERE organization_id = loser_id
    ON CONFLICT (person_id, organization_id) DO NOTHING;
  UPDATE event_participations SET organization_id = winner_id WHERE organization_id = loser_id;
  UPDATE initiative_enrollments SET organization_id = winner_id WHERE organization_id = loser_id;
  UPDATE interactions SET organization_id = winner_id WHERE organization_id = loser_id;
  UPDATE organization_signals SET organization_id = winner_id WHERE organization_id = loser_id;

  -- Fill null fields on winner from loser
  UPDATE organizations SET
    website = COALESCE(organizations.website, l.website),
    linkedin_url = COALESCE(organizations.linkedin_url, l.linkedin_url),
    description = COALESCE(organizations.description, l.description),
    logo_url = COALESCE(organizations.logo_url, l.logo_url),
    category = COALESCE(organizations.category, l.category),
    context = COALESCE(organizations.context, l.context),
    usp = COALESCE(organizations.usp, l.usp),
    icp_score = COALESCE(organizations.icp_score, l.icp_score),
    icp_reason = COALESCE(organizations.icp_reason, l.icp_reason)
  FROM organizations l
  WHERE organizations.id = winner_id AND l.id = loser_id;

  -- Clean up correlation candidates
  DELETE FROM correlation_candidates WHERE source_id = loser_id OR target_id = loser_id;

  -- Delete loser
  DELETE FROM organizations WHERE id = loser_id;
END;
$$ LANGUAGE plpgsql;
