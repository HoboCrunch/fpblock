ALTER TABLE sequences ADD COLUMN IF NOT EXISTS send_mode text NOT NULL DEFAULT 'approval';
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES sender_profiles(id);
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS schedule_config jsonb NOT NULL DEFAULT '{}';

UPDATE sequences SET steps = (
  SELECT jsonb_agg(
    jsonb_set(
      jsonb_set(
        step,
        '{body_template}',
        CASE
          WHEN step->>'body_template' IS NOT NULL
          THEN jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type', 'text', 'content', step->>'body_template')))
          ELSE '{"blocks": []}'::jsonb
        END
      ),
      '{subject_template}',
      CASE
        WHEN step->>'subject_template' IS NOT NULL
        THEN jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type', 'text', 'content', step->>'subject_template')))
        ELSE 'null'::jsonb
      END
    ) - 'prompt_template_id'
  )
  FROM jsonb_array_elements(steps) AS step
)
WHERE steps IS NOT NULL AND jsonb_array_length(steps) > 0;
