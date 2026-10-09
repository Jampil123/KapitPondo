-- Admin console Feedback inbox: unread until a System Administrator opens it.
alter table feedback add column if not exists read_at timestamptz;
create index if not exists idx_feedback_unread on feedback (created_at desc) where read_at is null;
