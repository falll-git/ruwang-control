-- Runtime can lock authority/identity during a decision without gaining UPDATE
-- privileges on the installation registry or operator identity.
CREATE FUNCTION control.lock_review_authority(target_instance uuid, target_operator uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM id FROM control.instances WHERE id = target_instance FOR SHARE;
  IF target_operator IS NOT NULL THEN
    PERFORM id FROM control.operators WHERE id = target_operator FOR SHARE;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION control.lock_review_authority(uuid, uuid) FROM PUBLIC;
