-- Phase 1: reconcile the two production inventory mismatches identified by the
-- Priority 8 reconciliation query.
-- Root cause: Stage 4 initialized warehouse_stock from products.stock_qty, but
-- did not create corresponding opening stock_movements. The two affected rows
-- therefore had correct current quantities but incomplete movement ledgers.
-- This migration is deliberately data-specific and fail-closed: unexpected
-- values abort the migration instead of silently correcting unrelated data.

begin;

DO $$
DECLARE
  v_count integer;
  v_sum numeric;
  v_min numeric;
  v_max numeric;
BEGIN
  SELECT count(*), coalesce(sum(delta),0), min(delta), max(delta)
    INTO v_count, v_sum, v_min, v_max
  FROM (
    SELECT ws.quantity - coalesce(sum(sm.change_qty),0) AS delta
    FROM public.warehouse_stock ws
    LEFT JOIN public.stock_movements sm
      ON sm.organization_id=ws.organization_id
     AND sm.warehouse_id=ws.warehouse_id
     AND sm.product_id=ws.product_id
    WHERE ws.organization_id='7c138229-3d5a-4455-b675-b203d5b28232'
      AND (ws.warehouse_id,ws.product_id) IN (
        ('219ed337-e0a2-4469-bf19-90f7b0f5ba43','6d72212f-abf7-48d6-8957-0d9fa97f5bff'),
        ('219ed337-e0a2-4469-bf19-90f7b0f5ba43','9b839415-b14d-4b44-95ac-f2c6aded5d4e')
      )
    GROUP BY ws.warehouse_id,ws.product_id,ws.quantity
    HAVING ws.quantity<>coalesce(sum(sm.change_qty),0)
  ) mismatches;

  -- Already reconciled: safe no-op on a repeated execution.
  IF v_count=0 THEN
    RETURN;
  END IF;

  -- Only the two audited mismatches are permitted to be corrected here:
  -- بادام +55 and پسته +31.
  IF v_count<>2 OR v_sum<>86 OR v_min<>31 OR v_max<>55 THEN
    RAISE EXCEPTION 'Unexpected stock reconciliation state: count=%, sum=%, min=%, max=%',v_count,v_sum,v_min,v_max;
  END IF;
END $$;

-- The normal RBAC trigger requires an authenticated application user. This is
-- a controlled migration-time correction, so only that trigger is disabled;
-- the audit trigger remains enabled and records the reconciliation operation.
ALTER TABLE public.stock_movements DISABLE TRIGGER trg_rbac_write_stock_movements;

WITH candidates AS (
  SELECT ws.organization_id,ws.warehouse_id,ws.product_id,
         ws.quantity-coalesce(sum(sm.change_qty),0) AS delta,
         min(p.created_at) AS opening_at
  FROM public.warehouse_stock ws
  JOIN public.products p
    ON p.id=ws.product_id AND p.organization_id=ws.organization_id
  LEFT JOIN public.stock_movements sm
    ON sm.organization_id=ws.organization_id
   AND sm.warehouse_id=ws.warehouse_id
   AND sm.product_id=ws.product_id
  WHERE ws.organization_id='7c138229-3d5a-4455-b675-b203d5b28232'
    AND (ws.warehouse_id,ws.product_id) IN (
      ('219ed337-e0a2-4469-bf19-90f7b0f5ba43','6d72212f-abf7-48d6-8957-0d9fa97f5bff'),
      ('219ed337-e0a2-4469-bf19-90f7b0f5ba43','9b839415-b14d-4b44-95ac-f2c6aded5d4e')
    )
  GROUP BY ws.organization_id,ws.warehouse_id,ws.product_id,ws.quantity
  HAVING ws.quantity<>coalesce(sum(sm.change_qty),0)
)
INSERT INTO public.stock_movements(
  organization_id,warehouse_id,product_id,change_qty,quantity,movement_type,
  reason,reference_type,reference_id,created_by,created_at
)
SELECT c.organization_id,c.warehouse_id,c.product_id,c.delta,abs(c.delta),'ADJUSTMENT',
       'Production reconciliation: opening stock omitted during warehouse_stock bootstrap',
       'RECONCILIATION',NULL,NULL,c.opening_at
FROM candidates c
WHERE NOT EXISTS (
  SELECT 1
  FROM public.stock_movements sm
  WHERE sm.organization_id=c.organization_id
    AND sm.warehouse_id=c.warehouse_id
    AND sm.product_id=c.product_id
    AND sm.movement_type='ADJUSTMENT'
    AND sm.reference_type='RECONCILIATION'
    AND sm.reason='Production reconciliation: opening stock omitted during warehouse_stock bootstrap'
);

WITH deltas AS (
  SELECT ws.organization_id,ws.warehouse_id,ws.product_id,
         ws.quantity-coalesce(sum(sm.change_qty),0) AS delta
  FROM public.warehouse_stock ws
  LEFT JOIN public.stock_movements sm
    ON sm.organization_id=ws.organization_id
   AND sm.warehouse_id=ws.warehouse_id
   AND sm.product_id=ws.product_id
  WHERE ws.organization_id='7c138229-3d5a-4455-b675-b203d5b28232'
    AND (ws.warehouse_id,ws.product_id) IN (
      ('219ed337-e0a2-4469-bf19-90f7b0f5ba43','6d72212f-abf7-48d6-8957-0d9fa97f5bff'),
      ('219ed337-e0a2-4469-bf19-90f7b0f5ba43','9b839415-b14d-4b44-95ac-f2c6aded5d4e')
    )
  GROUP BY ws.organization_id,ws.warehouse_id,ws.product_id,ws.quantity
  HAVING ws.quantity<>coalesce(sum(sm.change_qty),0)
)
UPDATE public.warehouse_stock ws
SET quantity=ws.quantity+d.delta,updated_at=now()
FROM deltas d
WHERE ws.organization_id=d.organization_id
  AND ws.warehouse_id=d.warehouse_id
  AND ws.product_id=d.product_id;

ALTER TABLE public.stock_movements ENABLE TRIGGER trg_rbac_write_stock_movements;

commit;
