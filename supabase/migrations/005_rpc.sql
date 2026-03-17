CREATE OR REPLACE FUNCTION message_status_counts()
RETURNS TABLE(status text, count bigint)
LANGUAGE sql STABLE
AS $$
  SELECT status, count(*) FROM messages GROUP BY status;
$$;
