-- History rows can be removed. They still cannot be edited in place.
-- The application allows that delete only for Super Admin.

DROP TRIGGER "AuditLog_append_only" ON "AuditLog";

CREATE OR REPLACE FUNCTION nas_forbid_audit_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'UPDATE on % is not allowed: audit history cannot be edited.', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_no_update"
  BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION nas_forbid_audit_update();
