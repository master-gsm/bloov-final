
/*
  # Drop trg_create_sale_journal_entry trigger and its function

  ## Reason
  The trigger `trg_create_sale_journal_entry` on the `sales` table was causing
  a duplicate journal entry whenever `create_sale_atomic` ran, because:
  - `create_sale_atomic` already inserts into `journal_entries` directly (atomic pattern).
  - The trigger also called `create_sale_journal_entry()` on INSERT/UPDATE of `sales`.
  This caused a UNIQUE constraint violation on `ux_journal_sale_idempotency`.

  ## Changes
  1. Drop trigger `trg_create_sale_journal_entry` on `sales`.
  2. Drop function `trigger_create_sale_journal_entry()` (no longer referenced anywhere).
  3. Drop function `create_sale_journal_entry(uuid)` (only called by the trigger above).

  ## No other triggers or functions are affected.
*/

DROP TRIGGER IF EXISTS trg_create_sale_journal_entry ON public.sales;

DROP FUNCTION IF EXISTS public.trigger_create_sale_journal_entry();

DROP FUNCTION IF EXISTS public.create_sale_journal_entry(uuid);
