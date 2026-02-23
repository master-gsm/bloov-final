
/*
  # Sync inventory.quantity → product_costing.quantity_on_hand

  ## Problem
  - inventory table contains real stock quantities (e.g. 60 units)
  - product_costing.quantity_on_hand is 0 for the same products
  - Sales validation reads from product_costing, not inventory
  - No purchase movements exist (data was seeded directly into inventory)

  ## What this migration does
  For every product_id + branch_id row in inventory:
    - If no product_costing row exists → INSERT with quantity_on_hand = inventory.quantity, average_cost = 0
    - If product_costing row exists → UPDATE quantity_on_hand = inventory.quantity
  total_value is a generated column (quantity_on_hand * average_cost) — not touched directly.

  ## What this migration does NOT change
  - No trigger logic
  - No RLS policies
  - No sale/purchase functions
*/

INSERT INTO product_costing (product_id, branch_id, quantity_on_hand, average_cost, created_at, updated_at)
SELECT
  i.product_id,
  i.branch_id,
  i.quantity,
  0,
  now(),
  now()
FROM inventory i
ON CONFLICT (product_id, branch_id)
DO UPDATE SET
  quantity_on_hand = EXCLUDED.quantity_on_hand,
  updated_at       = now()
WHERE product_costing.quantity_on_hand IS DISTINCT FROM EXCLUDED.quantity_on_hand;
