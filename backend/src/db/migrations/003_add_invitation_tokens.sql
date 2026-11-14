ALTER TABLE invitations
  ADD COLUMN token TEXT NOT NULL DEFAULT (
    replace(gen_random_uuid()::text, '-', '')
    || replace(gen_random_uuid()::text, '-', '')
  );

ALTER TABLE invitations
  ADD CONSTRAINT invitations_token_unique UNIQUE (token);
