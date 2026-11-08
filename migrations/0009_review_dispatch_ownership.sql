-- No backfill from today's registry: old commands have no proven original target.
ALTER TABLE control.review_commands
  ADD COLUMN target_digest char(64) CHECK (target_digest IS NULL OR target_digest ~ '^[a-f0-9]{64}$'),
  ADD COLUMN dispatch_attempt_id uuid,
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN dispatch_count integer NOT NULL DEFAULT 0 CHECK (dispatch_count >= 0),
  ADD CONSTRAINT review_command_lease_pair CHECK ((dispatch_attempt_id IS NULL) = (lease_expires_at IS NULL));
CREATE INDEX review_commands_expired_lease_idx ON control.review_commands (instance_id, lease_expires_at)
  WHERE state = 'DISPATCHING';
