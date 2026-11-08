-- One internal access model. Historical grants remain as inactive audit evidence.
ALTER TABLE control.operators
  ADD COLUMN access_role varchar(40) NOT NULL DEFAULT 'internal_operator',
  ADD CONSTRAINT operators_single_internal_role CHECK (access_role = 'internal_operator');

UPDATE control.operator_grants
  SET active = false, revoked_at = coalesce(revoked_at, now()) WHERE active;
ALTER TABLE control.operator_grants
  ADD CONSTRAINT operator_grants_historical_only CHECK (NOT active);

-- Reauthentication is mandatory when changing the authorization model.
UPDATE control.operator_sessions
  SET revoked_at = now(), revoked_reason = 'SINGLE_ROLE_MIGRATION'
  WHERE revoked_at IS NULL;

INSERT INTO control.security_audit_events
  (id, request_id, target_operator_id, action, outcome, reason_code, occurred_at)
SELECT gen_random_uuid(), 'migration_0014_single_internal_role', id,
  'operator.role_migration', 'succeeded', 'SINGLE_INTERNAL_ROLE', now()
FROM control.operators;
