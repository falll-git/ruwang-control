-- No operational identity fixtures. Organization verification is an explicit action.
CREATE TABLE control.verified_subject_bindings (
  instance_id uuid NOT NULL REFERENCES control.instances(id),
  subject varchar(180) NOT NULL CHECK (subject ~ '^[a-z][a-z0-9._-]*:[a-zA-Z0-9._:-]+$'),
  human_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  state varchar(12) NOT NULL CHECK (state IN ('VERIFIED','REVOKED')),
  verified_by uuid NOT NULL REFERENCES control.operators(id),
  evidence_reference varchar(160) NOT NULL CHECK (evidence_reference ~ '^[a-zA-Z0-9._:/-]{3,160}$'),
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (instance_id, subject)
);
CREATE INDEX verified_subject_humans ON control.verified_subject_bindings(instance_id,human_id);
REVOKE ALL ON control.verified_subject_bindings FROM PUBLIC;
CREATE TABLE control.subject_binding_versions (
  instance_id uuid NOT NULL REFERENCES control.instances(id), subject varchar(180) NOT NULL,
  human_id uuid NOT NULL, version integer NOT NULL, state varchar(12) NOT NULL,
  verified_by uuid NOT NULL REFERENCES control.operators(id), evidence_reference varchar(160) NOT NULL,
  verified_at timestamptz NOT NULL, PRIMARY KEY(instance_id,subject,version)
);
REVOKE ALL ON control.subject_binding_versions FROM PUBLIC;
CREATE FUNCTION control.record_subject_binding_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.version <> OLD.version+1 THEN RAISE EXCEPTION 'identity version conflict'; END IF;
  INSERT INTO control.subject_binding_versions VALUES(NEW.instance_id,NEW.subject,NEW.human_id,NEW.version,NEW.state,NEW.verified_by,NEW.evidence_reference,NEW.verified_at);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION control.record_subject_binding_version() FROM PUBLIC;
CREATE TRIGGER subject_binding_history AFTER INSERT OR UPDATE ON control.verified_subject_bindings
  FOR EACH ROW EXECUTE FUNCTION control.record_subject_binding_version();
