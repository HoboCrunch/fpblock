-- 033_dashboard_rpcs.sql
-- Server-side aggregations powering the redesigned admin dashboard.
-- These replace client-side full-table scans which silently truncated at
-- Supabase's 1000-row default cap, producing wrong pipeline-funnel counts.

-- ============================================
-- pipeline_funnel_counts()
-- Returns one row per pipeline stage. For each person, picks the most
-- advanced interaction status (replied > opened > delivered > sent >
-- sending > scheduled > draft > bounced > failed) and maps to a stage.
-- ============================================
CREATE OR REPLACE FUNCTION pipeline_funnel_counts()
RETURNS TABLE (stage text, count bigint) AS $$
  WITH ranked AS (
    SELECT
      p.id,
      COALESCE(
        MAX(CASE i.status
          WHEN 'replied'   THEN 8
          WHEN 'opened'    THEN 7
          WHEN 'clicked'   THEN 7
          WHEN 'delivered' THEN 6
          WHEN 'sent'      THEN 5
          WHEN 'sending'   THEN 4
          WHEN 'scheduled' THEN 3
          WHEN 'draft'     THEN 2
          WHEN 'bounced'   THEN 1
          WHEN 'failed'    THEN 0
          ELSE NULL
        END),
        -1
      ) AS best_rank
    FROM persons p
    LEFT JOIN interactions i ON i.person_id = p.id AND i.status IS NOT NULL
    GROUP BY p.id
  ),
  staged AS (
    SELECT
      CASE
        WHEN best_rank = -1 THEN 'not_contacted'
        WHEN best_rank = 8  THEN 'replied'
        WHEN best_rank = 7  THEN 'opened'
        WHEN best_rank IN (4,5,6) THEN 'sent'
        WHEN best_rank = 3  THEN 'scheduled'
        WHEN best_rank = 2  THEN 'draft'
        WHEN best_rank IN (0,1) THEN 'bounced_failed'
        ELSE 'not_contacted'
      END AS stage
    FROM ranked
  )
  SELECT stage, count(*)::bigint FROM staged GROUP BY stage;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION pipeline_funnel_counts() TO service_role, authenticated;

-- ============================================
-- reach_kpis()
-- Single roundtrip for the dashboard KPI strip.
-- ============================================
CREATE OR REPLACE FUNCTION reach_kpis()
RETURNS json AS $$
  WITH person_stats AS (
    SELECT
      count(*)::bigint AS total_persons,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM interactions i
        WHERE i.person_id = p.id
          AND i.status IN ('sent','delivered','opened','clicked','replied')
      ))::bigint AS persons_reached,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM interactions i
        WHERE i.person_id = p.id AND i.status = 'replied'
      ))::bigint AS persons_replied
    FROM persons p
  ),
  interaction_stats AS (
    SELECT
      count(*) FILTER (WHERE status IN ('sent','delivered','opened','clicked','replied'))::bigint AS total_sent,
      count(*) FILTER (WHERE status = 'replied')::bigint AS total_replied,
      count(*) FILTER (WHERE direction = 'outbound' AND status IN ('sent','delivered','opened','clicked','replied') AND occurred_at >= now() - interval '7 days')::bigint AS sent_7d,
      count(*) FILTER (WHERE direction = 'outbound' AND status IN ('sent','delivered','opened','clicked','replied') AND occurred_at >= now() - interval '24 hours')::bigint AS sent_24h,
      count(*) FILTER (WHERE status = 'replied' AND occurred_at >= now() - interval '7 days')::bigint AS replied_7d
    FROM interactions
  ),
  qualified AS (
    SELECT count(DISTINCT p.id)::bigint AS qualified_count
    FROM persons p
    JOIN person_organization po ON po.person_id = p.id AND po.is_primary = true
    JOIN organizations o ON o.id = po.organization_id
    WHERE o.icp_score >= 75
  )
  SELECT json_build_object(
    'total_persons',   (SELECT total_persons   FROM person_stats),
    'persons_reached', (SELECT persons_reached FROM person_stats),
    'persons_replied', (SELECT persons_replied FROM person_stats),
    'total_sent',      (SELECT total_sent      FROM interaction_stats),
    'total_replied',   (SELECT total_replied   FROM interaction_stats),
    'sent_7d',         (SELECT sent_7d         FROM interaction_stats),
    'sent_24h',        (SELECT sent_24h        FROM interaction_stats),
    'replied_7d',      (SELECT replied_7d      FROM interaction_stats),
    'qualified_count', (SELECT qualified_count FROM qualified)
  );
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION reach_kpis() TO service_role, authenticated;

-- ============================================
-- action_queue_counts()
-- "Needs attention" inbox for the operator.
-- ============================================
CREATE OR REPLACE FUNCTION action_queue_counts()
RETURNS json AS $$
  SELECT json_build_object(
    'drafts_pending',       (SELECT count(*) FROM interactions WHERE status = 'draft'),
    'scheduled_today',      (SELECT count(*) FROM interactions WHERE status = 'scheduled' AND scheduled_at::date = current_date),
    'failures',             (SELECT count(*) FROM interactions WHERE status IN ('bounced','failed') AND created_at >= now() - interval '30 days'),
    'unread_inbox',         (SELECT count(*) FROM inbound_emails WHERE direction = 'inbound' AND is_read = false),
    'replies_24h',          (SELECT count(*) FROM inbound_emails WHERE direction = 'inbound' AND received_at >= now() - interval '24 hours'),
    'pending_correlations', (SELECT count(*) FROM correlation_candidates WHERE status = 'pending')
  );
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION action_queue_counts() TO service_role, authenticated;

-- ============================================
-- sequence_performance_summary()
-- Per-sequence rollup using FILTER aggregates (single pass over interactions).
-- Only returns active + paused sequences. Channel cast for json compatibility.
-- ============================================
CREATE OR REPLACE FUNCTION sequence_performance_summary()
RETURNS TABLE (
  sequence_id uuid,
  name text,
  status text,
  channel text,
  enrolled bigint,
  sent bigint,
  opened bigint,
  replied bigint,
  bounced bigint
) AS $$
  WITH int_agg AS (
    SELECT
      i.sequence_id,
      count(*) FILTER (WHERE i.status IN ('sent','delivered','opened','clicked','replied'))::bigint AS sent,
      count(*) FILTER (WHERE i.status IN ('opened','clicked','replied'))::bigint               AS opened,
      count(*) FILTER (WHERE i.status = 'replied')::bigint                                     AS replied,
      count(*) FILTER (WHERE i.status IN ('bounced','failed'))::bigint                         AS bounced
    FROM interactions i
    WHERE i.sequence_id IS NOT NULL
    GROUP BY i.sequence_id
  ),
  enr_agg AS (
    SELECT e.sequence_id, count(*)::bigint AS enrolled
    FROM sequence_enrollments e
    GROUP BY e.sequence_id
  )
  SELECT
    s.id,
    s.name,
    s.status::text,
    s.channel::text,
    COALESCE(enr_agg.enrolled, 0),
    COALESCE(int_agg.sent, 0),
    COALESCE(int_agg.opened, 0),
    COALESCE(int_agg.replied, 0),
    COALESCE(int_agg.bounced, 0)
  FROM sequences s
  LEFT JOIN int_agg ON int_agg.sequence_id = s.id
  LEFT JOIN enr_agg ON enr_agg.sequence_id = s.id
  WHERE s.status IN ('active','paused')
  ORDER BY
    CASE s.status WHEN 'active' THEN 0 ELSE 1 END,
    COALESCE(int_agg.sent, 0) DESC,
    s.updated_at DESC;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION sequence_performance_summary() TO service_role, authenticated;

-- ============================================
-- event_person_pool view
-- Union of "person known to this event" sources (direct participation + via-org).
-- Used by upcoming_events_summary().
-- ============================================
CREATE OR REPLACE VIEW event_person_pool AS
SELECT DISTINCT pea.event_id, pea.person_id
FROM person_event_affiliations pea
UNION
SELECT DISTINCT ep.event_id, ep.person_id
FROM event_participations ep
WHERE ep.person_id IS NOT NULL;

-- ============================================
-- upcoming_events_summary()
-- Upcoming/in-flight events with their pipeline coverage.
-- "Upcoming" = date_end >= today OR date_end is null and date_start is null/future.
-- ============================================
CREATE OR REPLACE FUNCTION upcoming_events_summary(p_limit int DEFAULT 5)
RETURNS TABLE (
  event_id uuid,
  name text,
  slug text,
  location text,
  date_start date,
  date_end date,
  persons_count bigint,
  qualified_count bigint,
  sent_count bigint,
  replied_count bigint
) AS $$
  WITH person_stats AS (
    SELECT
      epp.event_id,
      count(DISTINCT epp.person_id)                                            AS persons_count,
      count(DISTINCT epp.person_id) FILTER (WHERE o.icp_score >= 75)           AS qualified_count
    FROM event_person_pool epp
    LEFT JOIN person_organization po ON po.person_id = epp.person_id AND po.is_primary = true
    LEFT JOIN organizations o        ON o.id = po.organization_id
    GROUP BY epp.event_id
  ),
  outreach_stats AS (
    SELECT
      epp.event_id,
      count(DISTINCT i.person_id) FILTER (WHERE i.status IN ('sent','delivered','opened','clicked','replied')) AS sent_count,
      count(DISTINCT i.person_id) FILTER (WHERE i.status = 'replied')                                          AS replied_count
    FROM event_person_pool epp
    JOIN interactions i ON i.person_id = epp.person_id
    GROUP BY epp.event_id
  )
  SELECT
    e.id,
    e.name,
    e.slug,
    e.location,
    e.date_start::date,
    e.date_end::date,
    COALESCE(ps.persons_count, 0)::bigint,
    COALESCE(ps.qualified_count, 0)::bigint,
    COALESCE(os.sent_count, 0)::bigint,
    COALESCE(os.replied_count, 0)::bigint
  FROM events e
  LEFT JOIN person_stats ps   ON ps.event_id = e.id
  LEFT JOIN outreach_stats os ON os.event_id = e.id
  WHERE
    (e.date_end >= current_date)
    OR (e.date_end IS NULL AND (e.date_start IS NULL OR e.date_start >= current_date))
  ORDER BY e.date_start ASC NULLS LAST
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION upcoming_events_summary(int) TO service_role, authenticated;

-- ============================================
-- icp_score_distribution()
-- Bucketed org counts by ICP score. Threshold conventions:
--   tier1     >= 90  (priority)
--   qualified 75–89  (Cannes ICP threshold)
--   mid       50–74
--   low       <50
--   unscored  null
-- ============================================
CREATE OR REPLACE FUNCTION icp_score_distribution()
RETURNS TABLE (bucket text, count bigint) AS $$
  SELECT 'tier1'::text,     count(*)::bigint FROM organizations WHERE icp_score >= 90
  UNION ALL
  SELECT 'qualified'::text, count(*)::bigint FROM organizations WHERE icp_score >= 75 AND icp_score < 90
  UNION ALL
  SELECT 'mid'::text,       count(*)::bigint FROM organizations WHERE icp_score >= 50 AND icp_score < 75
  UNION ALL
  SELECT 'low'::text,       count(*)::bigint FROM organizations WHERE icp_score IS NOT NULL AND icp_score < 50
  UNION ALL
  SELECT 'unscored'::text,  count(*)::bigint FROM organizations WHERE icp_score IS NULL;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION icp_score_distribution() TO service_role, authenticated;

-- ============================================
-- enrichment_coverage()
-- Single roundtrip for persons + orgs enrichment status breakdown.
-- ============================================
CREATE OR REPLACE FUNCTION enrichment_coverage()
RETURNS json AS $$
  SELECT json_build_object(
    'persons', json_build_object(
      'total',       (SELECT count(*) FROM persons),
      'complete',    (SELECT count(*) FROM persons WHERE enrichment_status = 'complete'),
      'in_progress', (SELECT count(*) FROM persons WHERE enrichment_status = 'in_progress'),
      'failed',      (SELECT count(*) FROM persons WHERE enrichment_status = 'failed'),
      'none',        (SELECT count(*) FROM persons WHERE enrichment_status = 'none' OR enrichment_status IS NULL)
    ),
    'organizations', json_build_object(
      'total',       (SELECT count(*) FROM organizations),
      'complete',    (SELECT count(*) FROM organizations WHERE enrichment_status = 'complete'),
      'partial',     (SELECT count(*) FROM organizations WHERE enrichment_status = 'partial'),
      'in_progress', (SELECT count(*) FROM organizations WHERE enrichment_status = 'in_progress'),
      'failed',      (SELECT count(*) FROM organizations WHERE enrichment_status = 'failed'),
      'none',        (SELECT count(*) FROM organizations WHERE enrichment_status = 'none' OR enrichment_status IS NULL)
    )
  );
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION enrichment_coverage() TO service_role, authenticated;
