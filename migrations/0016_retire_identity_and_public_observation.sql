-- Retire active features, not audit evidence. Never rewrite historical migrations.
CREATE SCHEMA control_audit_archive;
REVOKE ALL ON SCHEMA control_audit_archive FROM PUBLIC;

DROP TRIGGER subject_binding_history ON control.verified_subject_bindings;
DROP FUNCTION control.record_subject_binding_version();
ALTER TABLE control.verified_subject_bindings SET SCHEMA control_audit_archive;
ALTER TABLE control.subject_binding_versions SET SCHEMA control_audit_archive;
ALTER TABLE control.public_observation_attempts SET SCHEMA control_audit_archive;

COMMENT ON SCHEMA control_audit_archive IS 'Historical evidence of retired Control features. Not an active runtime API.';
COMMENT ON TABLE control_audit_archive.verified_subject_bindings IS 'Retired manual identity binding; not used to authorize decisions.';
COMMENT ON TABLE control_audit_archive.public_observation_attempts IS 'Retired public checks; not proof of current visibility.';
