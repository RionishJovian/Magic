-- Lovable Cloud SQL Editor — run 1/2 (storage). Paste ONLY this SQL, then run 2.
-- Fixes: users could upload payment receipts into another tenant's folder.

DROP POLICY IF EXISTS "payment receipts owner insert" ON storage.objects;
CREATE POLICY "payment receipts owner insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-receipts'
  AND (storage.foldername(name))[1] = (public.effective_owner(auth.uid()))::text
  AND (storage.foldername(name))[2] = (auth.uid())::text
);

DROP POLICY IF EXISTS "payment receipts owner update" ON storage.objects;
CREATE POLICY "payment receipts owner update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'payment-receipts'
  AND (storage.foldername(name))[1] = (public.effective_owner(auth.uid()))::text
)
WITH CHECK (
  bucket_id = 'payment-receipts'
  AND (storage.foldername(name))[1] = (public.effective_owner(auth.uid()))::text
  AND (storage.foldername(name))[2] = (auth.uid())::text
);

DROP POLICY IF EXISTS "payment receipts owner read" ON storage.objects;
CREATE POLICY "payment receipts owner read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-receipts'
  AND (
    (storage.foldername(name))[1] = (public.effective_owner(auth.uid()))::text
    OR (
      (storage.foldername(name))[1] = 'services'
      AND (storage.foldername(name))[2] = (auth.uid())::text
    )
  )
);
