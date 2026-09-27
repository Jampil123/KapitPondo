-- =====================================================================
-- KapitPondo — 0008 Communication
-- sender_name / sender_role are copied in at write time so a realtime
-- INSERT payload renders without a join, and a later rename doesn't
-- rewrite history.
-- =====================================================================

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid references members(id) on delete cascade,
  group_id   uuid references groups(id) on delete cascade,
  type       text not null,
  title      text,
  message    text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_notifications_member on notifications (member_id);

-- Group chat: 'general' for everyone, 'officers' for officers only.
create table messages (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references groups(id) on delete cascade,
  channel     message_channel not null,
  sender_id   uuid not null references members(id),
  sender_name text not null,
  body        text not null,
  image_url   text,
  created_at  timestamptz not null default now(),
  constraint messages_body_or_image check (
    char_length(body) <= 2000
    and (char_length(btrim(body)) > 0 or image_url is not null)
  )
);
create index idx_messages_group_channel_created on messages (group_id, channel, created_at desc);

-- 1-to-1 chat between two members of the same group.
create table direct_messages (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups(id) on delete cascade,
  sender_id    uuid not null references members(id),
  recipient_id uuid not null references members(id),
  sender_name  text not null,
  body         text not null default '',
  image_url    text,
  created_at   timestamptz not null default now(),
  constraint dm_not_self check (sender_id <> recipient_id),
  constraint dm_body_or_image check (
    char_length(body) <= 2000
    and (char_length(btrim(body)) > 0 or image_url is not null)
  )
);
create index idx_dm_pair_created
  on direct_messages (group_id, least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at desc);

-- Organizer broadcasts. recipient_count is resolved at send time.
create table announcements (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references groups(id) on delete cascade,
  sender_id       uuid not null references members(id),
  sender_name     text not null,
  sender_role     text not null,
  type            announcement_type not null,
  body            text not null,
  audience        announcement_audience not null,
  recipient_count integer not null default 0,
  created_at      timestamptz not null default now(),
  constraint announcements_body_not_blank
    check (char_length(btrim(body)) > 0 and char_length(body) <= 1000)
);
create index idx_announcements_group_created on announcements (group_id, created_at desc);
