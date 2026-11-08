ALTER TABLE control.instances
  ADD COLUMN adapter_base_url text,
  ADD COLUMN adapter_audience varchar(150),
  ADD COLUMN control_signing_key_id varchar(100),
  ADD COLUMN bank_ack_key_id varchar(100),
  ADD COLUMN bank_ack_public_key text,
  ADD CONSTRAINT instances_adapter_url_https_or_loopback CHECK (
    adapter_base_url IS NULL
    OR adapter_base_url ~ '^https://'
    OR adapter_base_url ~ '^http://(127\.0\.0\.1|localhost)(:[0-9]{1,5})?$'
  ),
  ADD CONSTRAINT instances_adapter_configuration_complete CHECK (
    (adapter_base_url IS NULL AND adapter_audience IS NULL AND control_signing_key_id IS NULL AND bank_ack_key_id IS NULL AND bank_ack_public_key IS NULL)
    OR
    (adapter_base_url IS NOT NULL AND adapter_audience IS NOT NULL AND control_signing_key_id IS NOT NULL AND bank_ack_key_id IS NOT NULL AND bank_ack_public_key IS NOT NULL)
  );

CREATE TABLE control.review_reasons (
  id uuid PRIMARY KEY,
  instance_id uuid NOT NULL REFERENCES control.instances(id) ON DELETE RESTRICT,
  snapshot_id uuid NOT NULL REFERENCES control.review_snapshots(id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_by_operator_id uuid NOT NULL REFERENCES control.operators(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE control.review_commands
  DROP CONSTRAINT review_commands_expected_version_check,
  ADD CONSTRAINT review_commands_expected_version_check CHECK (expected_version >= 0),
  ADD COLUMN contract_version integer NOT NULL DEFAULT 1 CHECK (contract_version = 1),
  ADD COLUMN request_payload jsonb,
  ADD COLUMN request_digest char(64) CHECK (request_digest IS NULL OR request_digest ~ '^[a-f0-9]{64}$'),
  ADD COLUMN result_code varchar(80),
  ADD COLUMN acknowledgment_payload jsonb,
  ADD COLUMN acknowledgment_digest char(64) CHECK (acknowledgment_digest IS NULL OR acknowledgment_digest ~ '^[a-f0-9]{64}$'),
  ADD COLUMN acknowledged_at timestamptz,
  ADD CONSTRAINT review_commands_reason_fk FOREIGN KEY (reason_reference) REFERENCES control.review_reasons(id) ON DELETE RESTRICT,
  ADD CONSTRAINT review_commands_payload_pair CHECK (
    (request_payload IS NULL AND request_digest IS NULL)
    OR (jsonb_typeof(request_payload) = 'object' AND request_digest IS NOT NULL)
  ),
  ADD CONSTRAINT review_commands_ack_pair CHECK (
    (acknowledgment_payload IS NULL AND acknowledgment_digest IS NULL AND acknowledged_at IS NULL)
    OR (jsonb_typeof(acknowledgment_payload) = 'object' AND acknowledgment_digest IS NOT NULL AND acknowledged_at IS NOT NULL)
  );

CREATE UNIQUE INDEX review_commands_instance_id_idx
  ON control.review_commands (instance_id, id);

CREATE TABLE control.review_dispatch_attempts (
  id uuid PRIMARY KEY,
  command_id uuid NOT NULL REFERENCES control.review_commands(id) ON DELETE RESTRICT,
  instance_id uuid NOT NULL REFERENCES control.instances(id) ON DELETE RESTRICT,
  nonce uuid NOT NULL,
  request_digest char(64) NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  state varchar(24) NOT NULL CHECK (state IN ('DISPATCHING', 'ACKNOWLEDGED', 'REJECTED', 'UNKNOWN', 'FAILED')),
  http_status integer CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  result_code varchar(80),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (instance_id, nonce)
);
CREATE INDEX review_dispatch_attempts_command_time_idx
  ON control.review_dispatch_attempts (command_id, started_at DESC);

CREATE TABLE control.bank_ack_nonces (
  instance_id uuid NOT NULL REFERENCES control.instances(id) ON DELETE RESTRICT,
  key_id varchar(100) NOT NULL,
  nonce uuid NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (instance_id, key_id, nonce),
  CHECK (expires_at > observed_at)
);
CREATE INDEX bank_ack_nonces_expiry_idx ON control.bank_ack_nonces (expires_at);
