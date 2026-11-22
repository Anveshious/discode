CREATE TABLE IF NOT EXISTS friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT friend_requests_status_check
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  CONSTRAINT friend_requests_requester_recipient_check
    CHECK (requester_id <> recipient_id),
  CONSTRAINT friend_requests_resolution_check
    CHECK (
      (status = 'pending' AND resolved_at IS NULL)
      OR (status <> 'pending' AND resolved_at IS NOT NULL)
    )
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = to_regclass('friend_requests')
      AND attname = 'sender_id'
      AND NOT attisdropped
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = to_regclass('friend_requests')
      AND attname = 'requester_id'
      AND NOT attisdropped
  ) THEN
    ALTER TABLE friend_requests RENAME COLUMN sender_id TO requester_id;
    ALTER TABLE friend_requests RENAME COLUMN receiver_id TO recipient_id;
    ALTER TABLE friend_requests ADD COLUMN resolved_at TIMESTAMPTZ;
    UPDATE friend_requests
    SET resolved_at = created_at
    WHERE status = 'accepted';
    ALTER TABLE friend_requests
      DROP CONSTRAINT IF EXISTS friend_requests_status_check,
      DROP CONSTRAINT IF EXISTS friend_requests_check;
    ALTER TABLE friend_requests
      ADD CONSTRAINT friend_requests_status_check
        CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
      ADD CONSTRAINT friend_requests_requester_recipient_check
        CHECK (requester_id <> recipient_id),
      ADD CONSTRAINT friend_requests_resolution_check
        CHECK (
          (status = 'pending' AND resolved_at IS NULL)
          OR (status <> 'pending' AND resolved_at IS NOT NULL)
        );
    DROP INDEX IF EXISTS friend_requests_pair_idx;
    DROP INDEX IF EXISTS friend_requests_receiver_idx;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_active_pair_idx
  ON friend_requests (
    LEAST(requester_id, recipient_id),
    GREATEST(requester_id, recipient_id)
  )
  WHERE status IN ('pending', 'accepted');

CREATE INDEX IF NOT EXISTS friend_requests_pending_recipient_idx
  ON friend_requests (recipient_id, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS friend_requests_requester_created_idx
  ON friend_requests (requester_id, created_at DESC);
