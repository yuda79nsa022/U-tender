-- Run this only if you already executed the original supabase/schema.sql
-- on a live project. A fresh project can just run the updated schema.sql
-- instead — it already includes these changes.

alter table contractor_profiles add column if not exists is_suspended boolean not null default false;

-- Replace the contractor-facing read/write policies with the suspension-aware versions.
drop policy if exists "projects_contractor_read" on projects;
create policy "projects_contractor_read" on projects for select using (
  status in ('open','closed','awarded') and exists (
    select 1 from contractor_profiles cp
    where cp.user_id = auth.uid() and cp.verification_status = 'approved' and cp.is_suspended = false
  )
);

drop policy if exists "drawings_contractor_read" on project_drawings;
create policy "drawings_contractor_read" on project_drawings for select using (
  exists (
    select 1 from contractor_profiles cp
    where cp.user_id = auth.uid()
      and cp.verification_status = 'approved'
      and cp.subscription_status = 'active'
      and cp.is_suspended = false
  )
);

drop policy if exists "offers_contractor_all" on offers;
drop policy if exists "offers_contractor_select" on offers;
drop policy if exists "offers_contractor_insert" on offers;
drop policy if exists "offers_contractor_update" on offers;

create policy "offers_contractor_select" on offers for select using (contractor_id = auth.uid());
create policy "offers_contractor_insert" on offers for insert with check (
  contractor_id = auth.uid()
  and exists (
    select 1 from contractor_profiles cp
    where cp.user_id = auth.uid()
      and cp.verification_status = 'approved'
      and cp.subscription_status = 'active'
      and cp.is_suspended = false
  )
);
create policy "offers_contractor_update" on offers for update using (contractor_id = auth.uid())
  with check (
    contractor_id = auth.uid()
    and exists (
      select 1 from contractor_profiles cp
      where cp.user_id = auth.uid() and cp.is_suspended = false
    )
  );
