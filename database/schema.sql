-- Database schema for BeliX Belmont Server (Supabase/PostgreSQL)

create table public.members (
  member_id bigint not null,
  username text not null,
  display_name text null,
  role text null,
  birthday date null,
  joined_at timestamp with time zone null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  discord_username text null,
  name text null,
  personal_email text null,
  academic_email text null,
  mobile_number text null,
  whatsapp_number text null,
  github_username text null,
  hackerrank_username text null,
  leetcode_username text null,
  instagram_username text null,
  duolingo_username text null,
  personal_website text null,
  linkedin_url text null,
  avatar_url text null,
  portfolio_url text null,
  resume_url text null,
  title text null,
  belmonts_level text null,
  belmonts_points integer null default 0,
  basher_no text null,
  joined_as_basher_date date null,
  joined_as_belmonts date null,
  primary_domain text null,
  secondary_domain text null,
  courses integer null default 0,
  projects integer null default 0,
  hackathons integer null default 0,
  internships integer null default 0,
  dailyprogress integer null default 0,
  certifications integer null default 0,
  gpa text null,
  weekly_bash_attendance text null,
  testimony text null,
  hobbies text null,
  roll_number text null,
  batch text null,
  date_of_birth date null,
  constraint members_pkey primary key (member_id)
) TABLESPACE pg_default;

create index if not exists idx_members_username on public.members using btree (username) TABLESPACE pg_default;

create index if not exists idx_members_birthday on public.members using btree (birthday) TABLESPACE pg_default;

create index if not exists idx_members_discord_username on public.members using btree (discord_username) TABLESPACE pg_default;

create table public.discord_activity (
  activity_id bigserial not null,
  member_id bigint null,
  discord_username text not null,
  display_name text null,
  activity_type text not null,
  channel_id text null,
  channel_name text null,
  message_count integer null default 0,
  voice_duration_minutes integer null default 0,
  reaction_count integer null default 0,
  activity_date date not null,
  activity_timestamp timestamp with time zone not null default now(),
  metadata jsonb null,
  created_at timestamp with time zone not null default now(),
  constraint discord_activity_pkey primary key (activity_id),
  constraint discord_activity_member_id_fkey foreign key (member_id) references members (member_id) on delete cascade
) TABLESPACE pg_default;

create index if not exists idx_discord_activity_member_id on public.discord_activity using btree (member_id) TABLESPACE pg_default;

create index if not exists idx_discord_activity_discord_username on public.discord_activity using btree (discord_username) TABLESPACE pg_default;

create index if not exists idx_discord_activity_date on public.discord_activity using btree (activity_date) TABLESPACE pg_default;

create index if not exists idx_discord_activity_type on public.discord_activity using btree (activity_type) TABLESPACE pg_default;

create table public.points (
  member_id bigint not null,
  points integer not null default 0,
  last_update timestamp with time zone null,
  updated_at timestamp with time zone not null default now(),
  constraint points_pkey primary key (member_id),
  constraint points_member_id_fkey foreign key (member_id) references members (member_id) on delete cascade
) TABLESPACE pg_default;

create index if not exists idx_points_member_id on public.points using btree (member_id) TABLESPACE pg_default;
-- Meetings table to track clan gatherings
create table public.meetings (
  meeting_id bigserial not null,
  title text not null,
  meeting_date date not null,
  meeting_time time not null,
  scheduled_time time null,
  start_time timestamp with time zone null,
  end_time timestamp with time zone null,
  duration_minutes integer null,
  total_members integer not null default 0,
  attended_members integer not null default 0,
  metadata jsonb null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint meetings_pkey primary key (meeting_id)
) TABLESPACE pg_default;

create index if not exists idx_meetings_date on public.meetings using btree (meeting_date) TABLESPACE pg_default;

-- Meeting attendance table to track individual member attendance
create table public.meeting_attendance (
  attendance_id bigserial not null,
  meeting_id bigint not null,
  member_id bigint not null,
  username text not null,
  display_name text null,
  joined_at timestamp with time zone null,
  left_at timestamp with time zone null,
  total_duration_minutes integer null default 0,
  attendance_percentage numeric(5,2) null,
  points_awarded integer null default 0,
  created_at timestamp with time zone not null default now(),
  constraint meeting_attendance_pkey primary key (attendance_id),
  constraint meeting_attendance_meeting_id_fkey foreign key (meeting_id) references meetings (meeting_id) on delete cascade,
  constraint meeting_attendance_member_id_fkey foreign key (member_id) references members (member_id) on delete cascade
) TABLESPACE pg_default;

create index if not exists idx_meeting_attendance_meeting_id on public.meeting_attendance using btree (meeting_id) TABLESPACE pg_default;

create index if not exists idx_meeting_attendance_member_id on public.meeting_attendance using btree (member_id) TABLESPACE pg_default;

-- Daily Gathering Confirmations table
create table public.gathering_confirmations (
  confirmation_id bigserial not null,
  gathering_date date not null,
  gathering_time time not null default '20:00:00',
  is_confirmed boolean not null default false,
  confirmed_by_id bigint null,
  confirmed_by_username text null,
  confirmed_at timestamp with time zone null,
  cancelled_by_id bigint null,
  cancelled_by_username text null,
  cancelled_at timestamp with time zone null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint gathering_confirmations_pkey primary key (confirmation_id),
  constraint gathering_confirmations_confirmed_by_fkey foreign key (confirmed_by_id) references members (member_id) on delete set null,
  constraint gathering_confirmations_cancelled_by_fkey foreign key (cancelled_by_id) references members (member_id) on delete set null
) TABLESPACE pg_default;

create index if not exists idx_gathering_confirmations_date on public.gathering_confirmations using btree (gathering_date) TABLESPACE pg_default;

create index if not exists idx_gathering_confirmations_confirmed_by on public.gathering_confirmations using btree (confirmed_by_id) TABLESPACE pg_default;