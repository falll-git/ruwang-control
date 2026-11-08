CREATE TABLE IF NOT EXISTS control.operators (
  id uuid PRIMARY KEY,
  email_canonical varchar(320) NOT NULL UNIQUE CHECK (email_canonical = lower(email_canonical)),
  display_name varchar(160) NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 160),
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  CHECK ((status = 'active' AND disabled_at IS NULL) OR (status = 'disabled' AND disabled_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS control.operator_password_credentials (
  operator_id uuid PRIMARY KEY REFERENCES control.operators(id) ON DELETE RESTRICT,
  password_hash varchar(512) NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control.operator_mfa_credentials (
  operator_id uuid PRIMARY KEY REFERENCES control.operators(id) ON DELETE RESTRICT,
  secret_envelope varchar(1024) NOT NULL,
  last_counter bigint NOT NULL DEFAULT -1,
  enrolled_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control.operator_grants (
  operator_id uuid NOT NULL REFERENCES control.operators(id) ON DELETE RESTRICT,
  instance_id uuid NOT NULL REFERENCES control.instances(id) ON DELETE RESTRICT,
  role varchar(40) NOT NULL CHECK (role IN ('observer', 'reviewer', 'bank_account_manager', 'control_access_manager')),
  active boolean NOT NULL DEFAULT true,
  created_by_operator_id uuid NOT NULL REFERENCES control.operators(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (operator_id, instance_id, role),
  CHECK ((active AND revoked_at IS NULL) OR (NOT active AND revoked_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS operator_grants_instance_active_idx
  ON control.operator_grants (instance_id, active, operator_id);

CREATE TABLE IF NOT EXISTS control.operator_sessions (
  id uuid PRIMARY KEY,
  operator_id uuid NOT NULL REFERENCES control.operators(id) ON DELETE RESTRICT,
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  csrf_token_hash char(64) CHECK (csrf_token_hash IS NULL OR csrf_token_hash ~ '^[a-f0-9]{64}$'),
  mfa_verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_reason varchar(64),
  user_agent_hash char(64) CHECK (user_agent_hash IS NULL OR user_agent_hash ~ '^[a-f0-9]{64}$'),
  ip_hash char(64) CHECK (ip_hash IS NULL OR ip_hash ~ '^[a-f0-9]{64}$'),
  CHECK (idle_expires_at <= absolute_expires_at),
  CHECK ((revoked_at IS NULL AND revoked_reason IS NULL) OR (revoked_at IS NOT NULL AND revoked_reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS operator_sessions_operator_active_idx
  ON control.operator_sessions (operator_id, revoked_at, absolute_expires_at);

CREATE TABLE IF NOT EXISTS control.auth_rate_limits (
  scope_hash char(64) PRIMARY KEY CHECK (scope_hash ~ '^[a-f0-9]{64}$'),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  window_started_at timestamptz NOT NULL,
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control.security_audit_events (
  id uuid PRIMARY KEY,
  request_id varchar(100) NOT NULL CHECK (request_id ~ '^[a-zA-Z0-9_-]{1,100}$'),
  actor_operator_id uuid REFERENCES control.operators(id) ON DELETE RESTRICT,
  subject_hash char(64) CHECK (subject_hash IS NULL OR subject_hash ~ '^[a-f0-9]{64}$'),
  instance_id uuid REFERENCES control.instances(id) ON DELETE RESTRICT,
  target_operator_id uuid REFERENCES control.operators(id) ON DELETE RESTRICT,
  action varchar(100) NOT NULL CHECK (action ~ '^[a-z][a-z0-9_.]{1,99}$'),
  outcome varchar(16) NOT NULL CHECK (outcome IN ('succeeded', 'rejected', 'denied')),
  reason_code varchar(80) NOT NULL CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_audit_actor_time_idx
  ON control.security_audit_events (actor_operator_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_instance_time_idx
  ON control.security_audit_events (instance_id, occurred_at DESC);
