-- =============================================================================
-- Migration 025: person_event_affiliations
-- =============================================================================
-- Stores the indirect relationship between a person and an event that is
-- created when a person is linked (via person_organization) to an organization
-- that participates in that event (via event_participations).
-- Maintained by bidirectional triggers; see spec:
-- docs/superpowers/specs/2026-04-24-person-event-affiliations-design.md
-- =============================================================================

CREATE TABLE person_event_affiliations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  person_id            uuid NOT NULL REFERENCES persons (id) ON DELETE CASCADE,
  via_organization_id  uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, person_id, via_organization_id)
);

CREATE INDEX idx_pea_event        ON person_event_affiliations (event_id);
CREATE INDEX idx_pea_person       ON person_event_affiliations (person_id);
CREATE INDEX idx_pea_via_org      ON person_event_affiliations (via_organization_id);
CREATE INDEX idx_pea_event_person ON person_event_affiliations (event_id, person_id);

-- RLS: mirror event_participations (migration 011) — single "Authenticated full access"
-- policy using auth.uid() IS NOT NULL (single-tenant trusted team convention).
ALTER TABLE person_event_affiliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON person_event_affiliations FOR ALL USING (auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------------------
-- Trigger function: sync from person_organization
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tg_pea_sync_from_person_org() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_current = true THEN
      INSERT INTO person_event_affiliations (event_id, person_id, via_organization_id)
      SELECT ep.event_id, NEW.person_id, NEW.organization_id
      FROM event_participations ep
      WHERE ep.organization_id = NEW.organization_id
      ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.person_id IS DISTINCT FROM OLD.person_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      DELETE FROM person_event_affiliations
       WHERE person_id = OLD.person_id
         AND via_organization_id = OLD.organization_id;
      IF NEW.is_current = true THEN
        INSERT INTO person_event_affiliations (event_id, person_id, via_organization_id)
        SELECT ep.event_id, NEW.person_id, NEW.organization_id
        FROM event_participations ep
        WHERE ep.organization_id = NEW.organization_id
        ON CONFLICT DO NOTHING;
      END IF;
      RETURN NEW;
    END IF;

    IF OLD.is_current = false AND NEW.is_current = true THEN
      INSERT INTO person_event_affiliations (event_id, person_id, via_organization_id)
      SELECT ep.event_id, NEW.person_id, NEW.organization_id
      FROM event_participations ep
      WHERE ep.organization_id = NEW.organization_id
      ON CONFLICT DO NOTHING;
    END IF;

    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM person_event_affiliations
     WHERE person_id = OLD.person_id
       AND via_organization_id = OLD.organization_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pea_sync_from_person_org
  AFTER INSERT OR UPDATE OR DELETE ON person_organization
  FOR EACH ROW EXECUTE FUNCTION tg_pea_sync_from_person_org();

-- ---------------------------------------------------------------------------
-- Trigger function: sync from event_participations
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tg_pea_sync_from_event_participation() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.organization_id IS NOT NULL THEN
      INSERT INTO person_event_affiliations (event_id, person_id, via_organization_id)
      SELECT NEW.event_id, po.person_id, NEW.organization_id
      FROM person_organization po
      WHERE po.organization_id = NEW.organization_id
        AND po.is_current = true
      ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.organization_id IS NOT NULL THEN
      DELETE FROM person_event_affiliations
       WHERE event_id = OLD.event_id
         AND via_organization_id = OLD.organization_id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pea_sync_from_event_participation
  AFTER INSERT OR DELETE ON event_participations
  FOR EACH ROW EXECUTE FUNCTION tg_pea_sync_from_event_participation();

-- ---------------------------------------------------------------------------
-- Backfill (idempotent)
-- ---------------------------------------------------------------------------

INSERT INTO person_event_affiliations (event_id, person_id, via_organization_id)
SELECT DISTINCT ep.event_id, po.person_id, ep.organization_id
FROM event_participations ep
JOIN person_organization po ON po.organization_id = ep.organization_id
WHERE ep.organization_id IS NOT NULL
  AND po.is_current = true
ON CONFLICT DO NOTHING;
