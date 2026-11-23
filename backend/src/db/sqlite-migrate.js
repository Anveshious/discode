export function migrateSqlite(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
      github_id INTEGER NOT NULL UNIQUE CHECK (github_id > 0),
      username TEXT NOT NULL,
      name TEXT,
      avatar_url TEXT NOT NULL,
      profile_url TEXT NOT NULL,
      bio TEXT,
      company TEXT,
      location TEXT,
      blog TEXT NOT NULL DEFAULT '',
      followers INTEGER NOT NULL DEFAULT 0 CHECK (followers >= 0),
      following INTEGER NOT NULL DEFAULT 0 CHECK (following >= 0),
      registered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      preferences TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));

    CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
      user_a_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_b_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      requested_by_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      accepted_at TEXT,
      CHECK (user_a_id < user_b_id),
      CHECK (requested_by_id IN (user_a_id, user_b_id)),
      CHECK ((status = 'accepted') = (accepted_at IS NOT NULL)),
      UNIQUE (user_a_id, user_b_id)
    );

    CREATE INDEX IF NOT EXISTS friendships_incoming_pending_idx
      ON friendships (user_b_id, user_a_id, created_at)
      WHERE status = 'pending';

    CREATE INDEX IF NOT EXISTS friendships_outgoing_pending_idx
      ON friendships (user_a_id, user_b_id, created_at)
      WHERE status = 'pending';

    CREATE TABLE IF NOT EXISTS user_presence (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('online', 'idle', 'focused', 'open-to-contribute', 'offline')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
      inviter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invitee_github_id INTEGER NOT NULL CHECK (invitee_github_id > 0),
      invitee_username TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      responded_at TEXT,
      token_hash TEXT NOT NULL UNIQUE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_pair_idx
      ON invitations (inviter_id, invitee_github_id)
      WHERE status = 'pending';

    CREATE INDEX IF NOT EXISTS invitations_pending_recipient_idx
      ON invitations (invitee_github_id, created_at DESC)
      WHERE status = 'pending';

    CREATE INDEX IF NOT EXISTS invitations_inviter_created_idx
      ON invitations (inviter_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS friend_requests (
      id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
      requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      resolved_at TEXT,
      CONSTRAINT friend_requests_requester_recipient_check CHECK (requester_id <> recipient_id),
      CONSTRAINT friend_requests_resolution_check CHECK (
        (status = 'pending' AND resolved_at IS NULL)
        OR (status <> 'pending' AND resolved_at IS NOT NULL)
      )
    );

    CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_active_pair_idx
      ON friend_requests (
        MIN(requester_id, recipient_id),
        MAX(requester_id, recipient_id)
      )
      WHERE status IN ('pending', 'accepted');

    CREATE INDEX IF NOT EXISTS friend_requests_pending_recipient_idx
      ON friend_requests (recipient_id, created_at DESC)
      WHERE status = 'pending';

    CREATE INDEX IF NOT EXISTS friend_requests_requester_created_idx
      ON friend_requests (requester_id, created_at DESC);
  `);
}
