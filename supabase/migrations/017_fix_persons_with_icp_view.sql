-- 017: Fix persons_with_icp view to deduplicate when multiple is_primary org links exist
CREATE OR REPLACE VIEW persons_with_icp AS
SELECT DISTINCT ON (p.id)
  p.*,
  o.name AS primary_org_name,
  o.icp_score,
  o.icp_reason,
  o.category AS org_category,
  po.role AS org_role
FROM persons p
LEFT JOIN person_organization po ON po.person_id = p.id AND po.is_primary = true
LEFT JOIN organizations o ON o.id = po.organization_id
ORDER BY p.id, po.created_at DESC;
