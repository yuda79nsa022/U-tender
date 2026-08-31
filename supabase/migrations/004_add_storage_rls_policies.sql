-- Run this if you already ran the original schema.sql on a live project.
-- Without these, file uploads/downloads through a user's own session
-- (as opposed to the service-role key) are silently denied by Supabase
-- Storage's default RLS, even though the app "owns" the bucket.
-- A fresh project can just run the updated schema.sql instead.

create policy "storage_drawings_owner_all" on storage.objects for all using (
  bucket_id = 'project-drawings'
  and exists (select 1 from projects p where p.id::text = (storage.foldername(name))[1] and p.owner_id = auth.uid())
) with check (
  bucket_id = 'project-drawings'
  and exists (select 1 from projects p where p.id::text = (storage.foldername(name))[1] and p.owner_id = auth.uid())
);
create policy "storage_drawings_contractor_select" on storage.objects for select using (
  bucket_id = 'project-drawings'
  and exists (
    select 1 from contractor_profiles cp
    where cp.user_id = auth.uid()
      and cp.verification_status = 'approved'
      and cp.subscription_status = 'active'
      and cp.is_suspended = false
  )
);
create policy "storage_drawings_admin_all" on storage.objects for all using (
  bucket_id = 'project-drawings' and is_admin()
) with check (bucket_id = 'project-drawings' and is_admin());

create policy "storage_documents_owner_all" on storage.objects for all using (
  bucket_id = 'contractor-documents' and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'contractor-documents' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "storage_documents_admin_select" on storage.objects for select using (
  bucket_id = 'contractor-documents' and is_admin()
);
