CREATE TABLE friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  CHECK (user_a_id < user_b_id),
  CHECK (requested_by_id IN (user_a_id, user_b_id)),
  CHECK ((status = 'accepted') = (accepted_at IS NOT NULL)),
  UNIQUE (user_a_id, user_b_id)
);

CREATE INDEX friendships_incoming_pending_idx
  ON friendships (user_b_id, user_a_id, created_at)
  WHERE status = 'pending';
CREATE INDEX friendships_outgoing_pending_idx
  ON friendships (user_a_id, user_b_id, created_at)
  WHERE status = 'pending';

CREATE TABLE user_presence (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL
    CHECK (status IN ('online', 'idle', 'focused', 'open-to-contribute', 'offline')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
