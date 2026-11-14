CREATE TABLE friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CHECK (requester_id <> recipient_id),
  CHECK (
    (status = 'pending' AND resolved_at IS NULL)
    OR (status <> 'pending' AND resolved_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX friend_requests_active_pair_idx
  ON friend_requests (
    LEAST(requester_id, recipient_id),
    GREATEST(requester_id, recipient_id)
  )
  WHERE status IN ('pending', 'accepted');

CREATE INDEX friend_requests_pending_recipient_idx
  ON friend_requests (recipient_id, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX friend_requests_requester_created_idx
  ON friend_requests (requester_id, created_at DESC);
