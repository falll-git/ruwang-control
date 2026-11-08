ALTER TABLE control.review_snapshots
  DROP CONSTRAINT review_snapshots_resource_kind_check,
  ADD CONSTRAINT review_snapshots_resource_kind_check
    CHECK (resource_kind IN ('publication', 'profile', 'contact', 'change_request')),
  DROP CONSTRAINT review_snapshots_state_check,
  ADD CONSTRAINT review_snapshots_state_check
    CHECK (state IN ('IN_REVIEW', 'REVISION_REQUIRED', 'APPROVED', 'REJECTED', 'SUPERSEDED'));

ALTER TABLE control.review_commands
  DROP CONSTRAINT review_commands_decision_check,
  ADD CONSTRAINT review_commands_decision_check
    CHECK (decision IN ('approve', 'request_revision', 'reject'));
