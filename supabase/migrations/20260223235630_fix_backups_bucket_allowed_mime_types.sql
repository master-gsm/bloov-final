/*
  # Fix backups bucket to allow JSON and text mime types

  The backups bucket was rejecting uploads because it had a restrictive
  allowed_mime_types list. This migration updates the bucket to accept:
  - application/json (backup files)
  - text/plain (test files)
  - application/octet-stream (generic binary)
*/

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/json',
  'text/plain',
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed'
]
WHERE id = 'backups';
