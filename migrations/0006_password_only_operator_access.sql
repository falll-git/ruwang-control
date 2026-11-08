ALTER TABLE control.operators
  ADD COLUMN username_canonical varchar(64);

UPDATE control.operators
SET username_canonical = 'operator_' || substr(replace(id::text, '-', ''), 1, 12)
WHERE username_canonical IS NULL;

ALTER TABLE control.operators
  ALTER COLUMN username_canonical SET NOT NULL,
  ALTER COLUMN email_canonical DROP NOT NULL,
  ADD CONSTRAINT operators_username_canonical_unique UNIQUE (username_canonical),
  ADD CONSTRAINT operators_username_canonical_format CHECK (
    username_canonical = lower(username_canonical)
    AND username_canonical ~ '^[a-z0-9][a-z0-9._-]{2,63}$'
  );

ALTER TABLE control.operator_sessions
  ADD COLUMN authenticated_at timestamptz;

UPDATE control.operator_sessions
SET authenticated_at = mfa_verified_at
WHERE authenticated_at IS NULL;

ALTER TABLE control.operator_sessions
  ALTER COLUMN authenticated_at SET NOT NULL,
  DROP COLUMN mfa_verified_at;

DROP TABLE control.operator_mfa_credentials;
