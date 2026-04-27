/*
  # Fix Public Bucket SELECT Policies for invoices and receipts

  Public buckets (invoices, receipts) do not need broad SELECT policies on
  storage.objects because object URLs are publicly accessible by design.
  Removing these policies prevents clients from listing all files in the bucket,
  which could expose unintended data.

  Changes:
  - Drop the broad authenticated SELECT policy on the invoices bucket
  - Drop the broad authenticated SELECT policy on the receipts bucket
*/

DROP POLICY IF EXISTS "authenticated_read_invoices" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_read_receipts" ON storage.objects;
