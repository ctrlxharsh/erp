-- Tenant isolation, second safety net (CONSTITUTION §6.5) and audit log protection (§2.3).
--
-- Model: the app connects as the table owner and runs normal lookups (sign-in, memberships) as the
-- owner. School-owned work runs inside `withSchool()`, which sets `app.school_id` and switches to
-- the restricted role `erp_app` for the transaction. `erp_app` is subject to the policies below.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    CREATE ROLE erp_app NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint
-- The connecting (owner) role must be allowed to SET ROLE erp_app.
DO $$ BEGIN EXECUTE format('GRANT erp_app TO %I', current_user); END $$;--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO erp_app;--> statement-breakpoint
-- Future school-owned tables get the same grants automatically; RLS policies still decide rows.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_app;--> statement-breakpoint

-- The school the current transaction acts on, or NULL when none is set.
CREATE FUNCTION app_school_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.school_id', true), '')::uuid $$;--> statement-breakpoint

-- memberships: school-owned.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON memberships TO erp_app;--> statement-breakpoint
CREATE POLICY tenant_isolation ON memberships FOR ALL TO erp_app
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());--> statement-breakpoint

-- schools: a school can see (and update) only its own row; creating or deleting schools is a
-- platform action done as the owner.
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, UPDATE ON schools TO erp_app;--> statement-breakpoint
CREATE POLICY tenant_isolation ON schools FOR ALL TO erp_app
  USING (id = app_school_id()) WITH CHECK (id = app_school_id());--> statement-breakpoint

-- platform_users: never reachable from school-scoped work.
REVOKE ALL ON platform_users FROM erp_app;--> statement-breakpoint

-- audit_events: append-only. erp_app may add and read its own school's events, nothing else.
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON audit_events FROM erp_app;--> statement-breakpoint
GRANT SELECT, INSERT ON audit_events TO erp_app;--> statement-breakpoint
CREATE POLICY tenant_read ON audit_events FOR SELECT TO erp_app USING (school_id = app_school_id());--> statement-breakpoint
CREATE POLICY tenant_insert ON audit_events FOR INSERT TO erp_app WITH CHECK (school_id = app_school_id());--> statement-breakpoint

-- Block UPDATE, DELETE and TRUNCATE for everyone, including the owner.
CREATE FUNCTION audit_events_block_changes() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN RAISE EXCEPTION 'audit_events is append-only'; END $$;--> statement-breakpoint
CREATE TRIGGER audit_events_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_block_changes();--> statement-breakpoint
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_block_changes();
