ALTER TABLE control.review_snapshots
  ADD COLUMN envelope_json jsonb,
  ADD COLUMN envelope_digest char(64) CHECK (envelope_digest IS NULL OR envelope_digest ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT review_snapshots_envelope_pair CHECK (
    (envelope_json IS NULL AND envelope_digest IS NULL)
    OR (jsonb_typeof(envelope_json) = 'object' AND envelope_digest IS NOT NULL)
  );

CREATE TABLE control.review_snapshot_nonces (
  instance_id uuid NOT NULL REFERENCES control.instances(id) ON DELETE RESTRICT,
  key_id varchar(100) NOT NULL,
  nonce uuid NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (instance_id, key_id, nonce),
  CHECK (expires_at > observed_at)
);
CREATE INDEX review_snapshot_nonces_expiry_idx ON control.review_snapshot_nonces (expires_at);
