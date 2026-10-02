-- =====================================================================
-- KapitPondo — 0064 Chat read marks
-- When each member last opened each conversation: 'general', 'officers',
-- 'announcements', or 'dm:<other member id>'. Drives bold-when-unread in the
-- chat list and "Seen" receipts. Written only by the API (service role).
-- =====================================================================

create table chat_reads (
  group_id     uuid not null references groups(id) on delete cascade,
  member_id    uuid not null references members(id) on delete cascade,
  conversation text not null,
  last_read_at timestamptz not null default now(),
  primary key (group_id, member_id, conversation),
  constraint chat_reads_conversation check (
    conversation in ('general', 'officers', 'announcements') or conversation ~ '^dm:[0-9a-f-]{36}$'
  )
);

alter table chat_reads enable row level security;

-- An active member sees: their own marks, the other person's mark on a DM
-- with them, and everyone's marks on the rooms they're in.
create policy "chat_reads: read as active member"
  on chat_reads for select to authenticated
  using (
    exists (
      select 1 from memberships ms
      where ms.group_id = chat_reads.group_id
        and ms.member_id = (select id from members where auth_id = auth.uid())
        and ms.status = 'active'
        and (
          chat_reads.member_id = ms.member_id
          or chat_reads.conversation = 'dm:' || ms.member_id
          or chat_reads.conversation in ('general', 'announcements')
          or (chat_reads.conversation = 'officers' and ms.role in ('owner', 'treasurer', 'auditor'))
        )
    )
  );

alter publication supabase_realtime add table chat_reads;
