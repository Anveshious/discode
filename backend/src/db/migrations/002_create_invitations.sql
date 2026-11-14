CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_github_id BIGINT NOT NULL CHECK (invitee_github_id > 0),
  invitee_username TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX invitations_pending_pair_idx
  ON invitations (inviter_id, invitee_github_id)
  WHERE status = 'pending';

CREATE INDEX invitations_pending_recipient_idx
  ON invitations (invitee_github_id, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX invitations_inviter_created_idx
  ON invitations (inviter_id, created_at DESC);

CREATE TABLE friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (sender_id <> receiver_id)
);

-- One request per pair, regardless of direction.
CREATE UNIQUE INDEX friend_requests_pair_idx
  ON friend_requests (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id));
CREATE INDEX friend_requests_receiver_idx ON friend_requests (receiver_id);