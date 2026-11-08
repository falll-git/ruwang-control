-- Explicit per-bank trust binding. No monitoring source or current installation
-- is inferred as a write target; existing banks remain unconfigured.
ALTER TABLE control.instances ADD COLUMN sj_recovery_binding jsonb;
ALTER TABLE control.instances ADD CONSTRAINT sj_recovery_binding_object CHECK(sj_recovery_binding IS NULL OR jsonb_typeof(sj_recovery_binding)='object');
ALTER TABLE control.delivery_recovery_requests ADD COLUMN provider varchar(8) NOT NULL DEFAULT 'BANK' CHECK(provider IN ('BANK','SJ'));
CREATE INDEX delivery_recovery_provider_job ON control.delivery_recovery_requests(instance_id,provider,job_id,created_at DESC,id);
