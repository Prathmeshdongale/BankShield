-- ============================================================================
-- Migration 002: Consolidate 7 Roles to 4 Modules
-- ============================================================================
-- This migration restructures the role system from:
--   super_admin, admin, compliance_officer, fraud_analyst, branch_manager, teller, customer
-- To:
--   super_admin, branch_manager, fraud_analyst, customer
--
-- Role Mapping:
--   admin → super_admin (system-level functions)
--   compliance_officer → super_admin (audit functions)
--   teller → branch_manager (frontline banking operations)
--   fraud_analyst → fraud_analyst (unchanged)
--   branch_manager → branch_manager (unchanged)
--   customer → customer (unchanged)
-- ============================================================================

-- Track this migration
ALTER TABLE schema_migrations 
ADD COLUMN IF NOT EXISTS migration_002_applied TIMESTAMPTZ;

-- Skip if already applied
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM schema_migrations WHERE migration_002_applied IS NOT NULL) THEN
    RAISE NOTICE 'Migration 002 already applied, skipping.';
    RETURN;
  END IF;
  
  -- Create migration log entry
  INSERT INTO schema_migrations (migration_002_applied) VALUES (NOW());
  
  -- Update users with old roles to new roles
  -- admin and compliance_officer → super_admin
  UPDATE users 
  SET role_id = (SELECT id FROM roles WHERE name = 'super_admin')
  WHERE role_id IN (
    SELECT id FROM roles WHERE name IN ('admin', 'compliance_officer')
  );
  
  -- teller → branch_manager
  UPDATE users 
  SET role_id = (SELECT id FROM roles WHERE name = 'branch_manager')
  WHERE role_id IN (
    SELECT id FROM roles WHERE name = 'teller'
  );
  
  -- Remove permissions for old roles
  DELETE FROM role_permissions 
  WHERE role_id IN (
    SELECT id FROM roles WHERE name IN ('admin', 'compliance_officer', 'teller')
  );
  
  -- Remove old roles
  DELETE FROM roles WHERE name IN ('admin', 'compliance_officer', 'teller');
  
  -- Log completion
  RAISE NOTICE 'Migration 002 completed successfully.';
  
END $$;
