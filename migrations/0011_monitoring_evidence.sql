-- Evidence only: no business status changes, no fabricated historical success.
CREATE TABLE control.public_observation_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  instance_id uuid NOT NULL REFERENCES control.instances(id),
  context_digest char(64) NOT NULL CHECK(context_digest ~ '^[a-f0-9]{64}$'),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  result jsonb,
  CHECK ((finished_at IS NULL) = (result IS NULL))
);
CREATE INDEX public_observation_context_idx ON control.public_observation_attempts(instance_id,context_digest,id DESC);
ALTER TABLE control.monitor_poll_state
  ADD COLUMN last_snapshot jsonb,
  ADD COLUMN last_snapshot_target char(64),
  ADD COLUMN last_failure_at timestamptz,
  ADD COLUMN last_failure_code text,
  ADD COLUMN last_failure_target char(64),
  ADD COLUMN last_attempt_target char(64);
