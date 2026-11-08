CREATE SCHEMA IF NOT EXISTS control;

CREATE TABLE IF NOT EXISTS control.instances (
  id uuid PRIMARY KEY,
  instance_key varchar(100) NOT NULL UNIQUE,
  display_name varchar(200) NOT NULL,
  review_authority varchar(16) NOT NULL DEFAULT 'local' CHECK (review_authority IN ('local', 'central')),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control.review_snapshots (
  id uuid PRIMARY KEY,
  instance_id uuid NOT NULL REFERENCES control.instances(id),
  resource_kind varchar(24) NOT NULL CHECK (resource_kind IN ('publication', 'profile', 'contact')),
  source_id uuid NOT NULL,
  source_version integer NOT NULL CHECK (source_version > 0),
  payload_checksum char(64) NOT NULL CHECK (payload_checksum ~ '^[a-f0-9]{64}$'),
  state varchar(32) NOT NULL CHECK (state IN ('IN_REVIEW', 'REVISION_REQUIRED', 'APPROVED', 'SUPERSEDED')),
  contributor_subjects jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(contributor_subjects) = 'array'),
  submitted_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instance_id, resource_kind, source_id, source_version)
);
CREATE INDEX IF NOT EXISTS review_snapshots_queue_idx
  ON control.review_snapshots (instance_id, state, submitted_at);

CREATE TABLE IF NOT EXISTS control.review_commands (
  id uuid PRIMARY KEY,
  snapshot_id uuid NOT NULL REFERENCES control.review_snapshots(id),
  instance_id uuid NOT NULL REFERENCES control.instances(id),
  actor_subject varchar(160) NOT NULL,
  decision varchar(32) NOT NULL CHECK (decision IN ('approve', 'request_revision')),
  reason_reference uuid,
  expected_version integer NOT NULL CHECK (expected_version > 0),
  expected_checksum char(64) NOT NULL CHECK (expected_checksum ~ '^[a-f0-9]{64}$'),
  state varchar(24) NOT NULL CHECK (state IN ('PENDING', 'DISPATCHING', 'APPLIED', 'REJECTED', 'UNKNOWN')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_commands_pending_idx
  ON control.review_commands (instance_id, state, created_at);

CREATE TABLE IF NOT EXISTS control.service_observations (
  instance_id uuid NOT NULL REFERENCES control.instances(id),
  service_key varchar(80) NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('healthy', 'degraded', 'offline', 'unknown')),
  observed_at timestamptz NOT NULL,
  detail_code varchar(80),
  PRIMARY KEY (instance_id, service_key)
);

CREATE TABLE IF NOT EXISTS control.audit_events (
  id uuid PRIMARY KEY,
  request_id varchar(100) NOT NULL,
  actor_subject varchar(160) NOT NULL,
  instance_id uuid NOT NULL REFERENCES control.instances(id),
  resource_kind varchar(40) NOT NULL,
  resource_id varchar(100) NOT NULL,
  action varchar(100) NOT NULL,
  outcome varchar(32) NOT NULL,
  reason_code varchar(80) NOT NULL,
  resource_version integer NOT NULL CHECK (resource_version > 0),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_instance_time_idx
  ON control.audit_events (instance_id, occurred_at DESC);
