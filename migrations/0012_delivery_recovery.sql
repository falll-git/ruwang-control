-- Explicit grant only. No existing operator receives recovery privileges.
ALTER TABLE control.operator_grants DROP CONSTRAINT operator_grants_role_check;
ALTER TABLE control.operator_grants ADD CONSTRAINT operator_grants_role_check
  CHECK (role IN ('observer','reviewer','bank_account_manager','control_access_manager','delivery_operator'));

CREATE TABLE control.delivery_recovery_requests (
  id uuid PRIMARY KEY,
  instance_id uuid NOT NULL REFERENCES control.instances(id) ON DELETE RESTRICT,
  operator_id uuid NOT NULL REFERENCES control.operators(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL,
  target_digest char(64) NOT NULL CHECK(target_digest ~ '^[a-f0-9]{64}$'),
  request_digest char(64) NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
  request_payload jsonb NOT NULL,
  state varchar(16) NOT NULL DEFAULT 'UNKNOWN' CHECK(state IN ('UNKNOWN','RECORDED')),
  result_json jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((state='UNKNOWN' AND result_json IS NULL) OR (state='RECORDED' AND result_json IS NOT NULL))
);
CREATE INDEX delivery_recovery_instance_job ON control.delivery_recovery_requests(instance_id,job_id,created_at DESC,id);
