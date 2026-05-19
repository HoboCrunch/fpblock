-- 032_active_conversations_rpc.sql
-- Count distinct persons with recent two-way email activity.

CREATE OR REPLACE FUNCTION active_conversations_count(window_days int DEFAULT 14)
RETURNS bigint AS $$
  SELECT COUNT(DISTINCT outbound.person_id)
  FROM interactions outbound
  JOIN inbound_emails inbound ON inbound.person_id = outbound.person_id
  WHERE outbound.direction = 'outbound'
    AND outbound.channel = 'email'
    AND outbound.status IN ('sent','delivered','opened','replied')
    AND outbound.occurred_at >= NOW() - (window_days * 2 || ' days')::interval
    AND inbound.direction = 'inbound'
    AND inbound.received_at >= NOW() - (window_days || ' days')::interval;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION active_conversations_count(int) TO service_role, authenticated;
