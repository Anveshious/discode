CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id BIGINT NOT NULL UNIQUE CHECK (github_id > 0),
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
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(preferences) = 'object')
);

CREATE INDEX users_username_lower_idx ON users (lower(username));
