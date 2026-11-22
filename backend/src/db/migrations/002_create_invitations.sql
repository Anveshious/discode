CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_github_id BIGINT NOT NULL CHECK (invitee_github_id > 0),
  invitee_username TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_pair_idx
  ON invitations (inviter_id, invitee_github_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS invitations_pending_recipient_idx
  ON invitations (invitee_github_id, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS invitations_inviter_created_idx
  ON invitations (inviter_id, created_at DESC);