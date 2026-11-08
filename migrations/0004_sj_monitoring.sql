CREATE TABLE control.monitor_sources (
  instance_id uuid PRIMARY KEY REFERENCES control.instances(id) ON DELETE RESTRICT,
  source_kind varchar(16) NOT NULL CHECK (source_kind IN ('ruwang', 'sj_central')),
  base_url text NOT NULL,
  audience varchar(150) NOT NULL,
  control_key_id varchar(100) NOT NULL,
  response_key_id varchar(100) NOT NULL,
  response_public_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  stale_after_seconds integer NOT NULL DEFAULT 120 CHECK (stale_after_seconds BETWEEN 30 AND 3600),
  poll_interval_seconds integer NOT NULL DEFAULT 30 CHECK (poll_interval_seconds BETWEEN 15 AND 900),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monitor_sources_url_https_or_loopback CHECK (
    base_url ~ '^https://'
    OR base_url ~ '^http://(127\.0\.0\.1|localhost)(:[0-9]{1,5})?$'
  )
);

CREATE TABLE control.monitor_poll_state (
  instance_id uuid PRIMARY KEY REFERENCES control.monitor_sources(instance_id) ON DELETE RESTRICT,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  next_poll_at timestamptz NOT NULL DEFAULT now(),
  last_result_code varchar(80),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX monitor_poll_state_due_idx ON control.monitor_poll_state (next_poll_at, instance_id);

CREATE TABLE control.monitor_response_nonces (
  instance_id uuid NOT NULL REFERENCES control.monitor_sources(instance_id) ON DELETE RESTRICT,
  key_id varchar(100) NOT NULL,
  nonce uuid NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (instance_id, key_id, nonce),
  CHECK (expires_at > observed_at)
);
CREATE INDEX monitor_response_nonces_expiry_idx ON control.monitor_response_nonces (expires_at);

ALTER TABLE control.service_observations
  ADD COLUMN metric_value bigint CHECK (metric_value IS NULL OR metric_value >= 0),
  ADD COLUMN source_observed_at timestamptz;
