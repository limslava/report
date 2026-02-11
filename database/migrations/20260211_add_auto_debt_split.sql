-- Add manual debt metrics for AUTO segment
INSERT INTO planning_metrics (id, segment_id, code, name, is_editable, value_type, aggregation, formula, order_index, created_at, updated_at)
SELECT gen_random_uuid(), s.id, 'auto_debt_unpaid', 'ДЗ (не оплаченная) (₽)', true, 'CURRENCY', 'LAST', NULL, 220, NOW(), NOW()
FROM planning_segments s
WHERE s.code = 'AUTO'
  AND NOT EXISTS (
    SELECT 1 FROM planning_metrics m WHERE m.segment_id = s.id AND m.code = 'auto_debt_unpaid'
  );

INSERT INTO planning_metrics (id, segment_id, code, name, is_editable, value_type, aggregation, formula, order_index, created_at, updated_at)
SELECT gen_random_uuid(), s.id, 'auto_debt_paid_cards', 'ДЗ (оплачено на карты) (₽)', true, 'CURRENCY', 'LAST', NULL, 230, NOW(), NOW()
FROM planning_segments s
WHERE s.code = 'AUTO'
  AND NOT EXISTS (
    SELECT 1 FROM planning_metrics m WHERE m.segment_id = s.id AND m.code = 'auto_debt_paid_cards'
  );
