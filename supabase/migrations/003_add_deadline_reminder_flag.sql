-- Run this only if you already executed the original supabase/schema.sql
-- on a live project. A fresh project can just run the updated schema.sql
-- instead — it already includes this column.

alter table projects add column if not exists deadline_reminder_sent boolean not null default false;
