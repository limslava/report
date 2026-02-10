-- Add split movement fact metrics for KTK segments
INSERT INTO planning_metrics (id, segment_id, code, name, is_editable, value_type, aggregation, formula, order_index, created_at, updated_at)
SELECT gen_random_uuid(), s.id, 'ktk_vvo_fact_move_own', 'Собственные ТС', true, 'INT', 'SUM', NULL, 21, NOW(), NOW()
FROM planning_segments s
WHERE s.code = 'KTK_VVO'
  AND NOT EXISTS (
    SELECT 1 FROM planning_metrics m WHERE m.segment_id = s.id AND m.code = 'ktk_vvo_fact_move_own'
  );

INSERT INTO planning_metrics (id, segment_id, code, name, is_editable, value_type, aggregation, formula, order_index, created_at, updated_at)
SELECT gen_random_uuid(), s.id, 'ktk_vvo_fact_move_hired', 'Наемные ТС', true, 'INT', 'SUM', NULL, 22, NOW(), NOW()
FROM planning_segments s
WHERE s.code = 'KTK_VVO'
  AND NOT EXISTS (
    SELECT 1 FROM planning_metrics m WHERE m.segment_id = s.id AND m.code = 'ktk_vvo_fact_move_hired'
  );

INSERT INTO planning_metrics (id, segment_id, code, name, is_editable, value_type, aggregation, formula, order_index, created_at, updated_at)
SELECT gen_random_uuid(), s.id, 'ktk_mow_fact_move_own', 'Собственные ТС', true, 'INT', 'SUM', NULL, 21, NOW(), NOW()
FROM planning_segments s
WHERE s.code = 'KTK_MOW'
  AND NOT EXISTS (
    SELECT 1 FROM planning_metrics m WHERE m.segment_id = s.id AND m.code = 'ktk_mow_fact_move_own'
  );

INSERT INTO planning_metrics (id, segment_id, code, name, is_editable, value_type, aggregation, formula, order_index, created_at, updated_at)
SELECT gen_random_uuid(), s.id, 'ktk_mow_fact_move_hired', 'Наемные ТС', true, 'INT', 'SUM', NULL, 22, NOW(), NOW()
FROM planning_segments s
WHERE s.code = 'KTK_MOW'
  AND NOT EXISTS (
    SELECT 1 FROM planning_metrics m WHERE m.segment_id = s.id AND m.code = 'ktk_mow_fact_move_hired'
  );
