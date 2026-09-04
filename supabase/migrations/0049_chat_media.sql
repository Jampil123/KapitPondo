-- =====================================================================
-- KapitPondo — Migration 0049
-- Lets a chat message (0030_messages.sql) carry an image instead of/along
-- with text, and adds storage RLS for the bucket that holds them.
--
-- The `chat-media` bucket itself is created via the dashboard/admin API,
-- not SQL — bucket creation isn't part of migrations here, same as
-- id-documents/proofs (0012) and avatars (0019). It must be created PUBLIC:
-- chat images render directly in message bubbles from a plain URL, same
-- tradeoff avatars already made, so no signed-URL exchange per image.
-- =====================================================================

alter table messages add column if not exists image_url text;

-- A message needs a body OR an image, never neither. (Both is fine — a
-- caption on a photo.) Replaces the text-only constraint from 0030.
alter table messages drop constraint if exists messages_body_not_blank;
alter table messages add constraint messages_body_or_image
  check (
    char_length(body) <= 2000
    and (
      char_length(btrim(body)) > 0
      or image_url is not null
    )
  );

drop policy if exists "authenticated can upload chat media" on storage.objects;
create policy "authenticated can upload chat media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'chat-media');

drop policy if exists "anyone can read chat media" on storage.objects;
create policy "anyone can read chat media"
  on storage.objects for select
  to public
  using (bucket_id = 'chat-media');

-- =====================================================================
-- End of 0049_chat_media.sql
-- =====================================================================
