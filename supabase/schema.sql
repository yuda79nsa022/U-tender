-- ============================================================
-- U-TENDER — Database schema (Supabase / Postgres)
-- Run this in the Supabase SQL editor on a fresh project.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ---------- Enums ----------
create type user_role as enum ('owner', 'contractor', 'admin');
create type project_status as enum ('open', 'closed', 'awarded', 'canceled');
create type offer_status as enum ('submitted', 'approved', 'rejected', 'withdrawn');
create type verification_status as enum ('incomplete', 'pending_review', 'changes_requested', 'approved');
create type document_status as enum ('not_submitted', 'pending', 'approved', 'rejected');
create type subscription_status as enum ('trialing', 'active', 'past_due', 'canceled');

-- ---------- Profiles (extends Supabase auth.users) ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'owner',
  full_name text,
  phone text,
  created_at timestamptz not null default now()
);

-- ---------- Contractor-specific profile data ----------
create table contractor_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  company_name text not null,
  license_number text,
  primary_trade text,
  service_area text,
  verification_status verification_status not null default 'incomplete',
  is_suspended boolean not null default false,
  avg_rating numeric(2,1) default 0,
  review_count integer not null default 0,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status subscription_status,
  subscription_current_period_end timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Document requirements (admin-managed, drives the checklist) ----------
create table document_requirements (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  is_required boolean not null default true,
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- Contractor document submissions against those requirements ----------
create table contractor_documents (
  id uuid primary key default uuid_generate_v4(),
  contractor_id uuid not null references contractor_profiles(user_id) on delete cascade,
  requirement_id uuid not null references document_requirements(id) on delete cascade,
  file_path text,               -- path in Supabase Storage private bucket
  status document_status not null default 'not_submitted',
  admin_note text,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  submitted_at timestamptz,
  expires_on date,
  unique (contractor_id, requirement_id)
);

-- ---------- Projects (posted by owners) ----------
create table projects (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  address text not null,
  description text,
  trade text,
  bid_deadline timestamptz not null,
  status project_status not null default 'open',
  deadline_reminder_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create table project_drawings (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  file_path text not null,      -- path in Supabase Storage private bucket
  file_name text not null,
  uploaded_at timestamptz not null default now()
);

-- ---------- Offers (bids by contractors) ----------
create table offers (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  contractor_id uuid not null references contractor_profiles(user_id) on delete cascade,
  amount numeric(12,2) not null,
  timeline_estimate text,
  message text,
  status offer_status not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, contractor_id)
);

-- ---------- Reviews (owner rates contractor after project completion) ----------
create table reviews (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  owner_id uuid not null references profiles(id),
  contractor_id uuid not null references contractor_profiles(user_id),
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (project_id)
);

-- ---------- Indexes ----------
create index idx_projects_status on projects(status);
create index idx_projects_owner on projects(owner_id);
create index idx_offers_project on offers(project_id);
create index idx_offers_contractor on offers(contractor_id);
create index idx_contractor_documents_contractor on contractor_documents(contractor_id);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table profiles enable row level security;
alter table contractor_profiles enable row level security;
alter table document_requirements enable row level security;
alter table contractor_documents enable row level security;
alter table projects enable row level security;
alter table project_drawings enable row level security;
alter table offers enable row level security;
alter table reviews enable row level security;

-- Helper: is the current user an admin?
create or replace function is_admin() returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- profiles: users see/edit their own row; admins see all
create policy "profiles_self" on profiles for select using (id = auth.uid() or is_admin());
create policy "profiles_self_update" on profiles for update using (id = auth.uid());

-- contractor_profiles: owner of the row, or any authenticated user (public rating info), or admin
create policy "contractor_profiles_read" on contractor_profiles for select using (true);
create policy "contractor_profiles_self_write" on contractor_profiles for update using (user_id = auth.uid() or is_admin());
create policy "contractor_profiles_insert" on contractor_profiles for insert with check (user_id = auth.uid());

-- document_requirements: everyone can read active ones, only admins write
create policy "requirements_read" on document_requirements for select using (true);
create policy "requirements_admin_write" on document_requirements for insert with check (is_admin());
create policy "requirements_admin_update" on document_requirements for update using (is_admin());
create policy "requirements_admin_delete" on document_requirements for delete using (is_admin());

-- contractor_documents: contractor sees their own, admin sees all
create policy "documents_owner_read" on contractor_documents for select using (contractor_id = auth.uid() or is_admin());
create policy "documents_owner_write" on contractor_documents for insert with check (contractor_id = auth.uid());
create policy "documents_owner_update" on contractor_documents for update using (contractor_id = auth.uid() or is_admin());

-- projects: owner manages their own; open projects are readable by approved contractors + the owner + admin
create policy "projects_owner_all" on projects for all using (owner_id = auth.uid() or is_admin());
create policy "projects_contractor_read" on projects for select using (
  status in ('open','closed','awarded') and exists (
    select 1 from contractor_profiles cp
    where cp.user_id = auth.uid() and cp.verification_status = 'approved' and cp.is_suspended = false
  )
);

-- project_drawings: only visible to the owner, admins, and approved+subscribed+not-suspended contractors
create policy "drawings_owner" on project_drawings for all using (
  exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid())
  or is_admin()
);
create policy "drawings_contractor_read" on project_drawings for select using (
  exists (
    select 1 from contractor_profiles cp
    where cp.user_id = auth.uid()
      and cp.verification_status = 'approved'
      and cp.subscription_status = 'active'
      and cp.is_suspended = false
  )
);

-- offers: split by operation rather than one FOR ALL policy, so eligibility
-- (approved, subscribed, not suspended) is actually enforced by the
-- database on writes — not just by the app's Server Actions, which a
-- suspended contractor could otherwise bypass by calling the Supabase API
-- directly with their own session token.
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
create policy "offers_owner_read" on offers for select using (
  exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid())
);

-- reviews: owner writes for their own completed project; everyone can read (public reputation)
create policy "reviews_read" on reviews for select using (true);
create policy "reviews_owner_write" on reviews for insert with check (owner_id = auth.uid());

-- ============================================================
-- Storage — Row Level Security on storage.objects
-- ============================================================
-- Supabase enables RLS on storage.objects by default. Without these
-- policies, uploads/downloads via a user's own session (not the
-- service-role key) are silently denied even for a private bucket the
-- app otherwise "owns" — the bucket being private controls whether
-- anonymous/public access works, not whether an authenticated user's
-- session can read or write to it. Both buckets must already exist
-- (create them in the Supabase dashboard; SQL can't create buckets).
--
-- Both buckets are keyed so the first path segment identifies the
-- resource: project-drawings/{project_id}/..., contractor-documents/{contractor_id}/...

-- project-drawings: owner has full access to their own project's folder;
-- approved+subscribed+not-suspended contractors can read any project's
-- drawings (the projects_contractor_read policy already scopes which
-- *rows* they see — this just lets them read the underlying file bytes
-- for rows they're already allowed to see); admins have full access.
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

-- contractor-documents: contractor has full access to their own folder
-- only; admins can read (to review submitted documents) but not write.
create policy "storage_documents_owner_all" on storage.objects for all using (
  bucket_id = 'contractor-documents' and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'contractor-documents' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "storage_documents_admin_select" on storage.objects for select using (
  bucket_id = 'contractor-documents' and is_admin()
);
