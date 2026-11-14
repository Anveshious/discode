ALTER TABLE invitations
  ADD COLUMN token_hash TEXT;

UPDATE invitations
SET token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex');

ALTER TABLE invitations
  ALTER COLUMN token_hash SET NOT NULL;

ALTER TABLE invitations
  DROP CONSTRAINT invitations_token_unique,
  DROP COLUMN token,
  ADD CONSTRAINT invitations_token_hash_unique UNIQUE (token_hash);
