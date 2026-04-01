-- Fix: Assign Device Testing permissions by role name (not hardcoded role_id)
-- Run this if you used the original add_device_testing_schema.sql which used role_id=1/2

-- First: confirm the permissions exist
IF NOT EXISTS (SELECT 1 FROM permissions WHERE permission_name = 'View Device Testing')
    INSERT INTO permissions (permission_name) VALUES ('View Device Testing');

IF NOT EXISTS (SELECT 1 FROM permissions WHERE permission_name = 'Manage Device Testing Tables')
    INSERT INTO permissions (permission_name) VALUES ('Manage Device Testing Tables');

-- Assign "View Device Testing" to SYSTEM_ADMIN
INSERT INTO role_permission (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_name = 'SYSTEM_ADMIN'
  AND p.permission_name = 'View Device Testing'
  AND NOT EXISTS (
    SELECT 1 FROM role_permission rp
    WHERE rp.role_id = r.role_id AND rp.permission_id = p.permission_id
  );

-- Assign "View Device Testing" to SUPER_ADMIN
INSERT INTO role_permission (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_name = 'SUPER_ADMIN'
  AND p.permission_name = 'View Device Testing'
  AND NOT EXISTS (
    SELECT 1 FROM role_permission rp
    WHERE rp.role_id = r.role_id AND rp.permission_id = p.permission_id
  );

-- Assign "View Device Testing" to CLIENT_ADMIN
INSERT INTO role_permission (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_name = 'CLIENT_ADMIN'
  AND p.permission_name = 'View Device Testing'
  AND NOT EXISTS (
    SELECT 1 FROM role_permission rp
    WHERE rp.role_id = r.role_id AND rp.permission_id = p.permission_id
  );

-- Assign "Manage Device Testing Tables" to SYSTEM_ADMIN only
INSERT INTO role_permission (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_name = 'SYSTEM_ADMIN'
  AND p.permission_name = 'Manage Device Testing Tables'
  AND NOT EXISTS (
    SELECT 1 FROM role_permission rp
    WHERE rp.role_id = r.role_id AND rp.permission_id = p.permission_id
  );

-- Verify
SELECT r.role_name, p.permission_name
FROM role_permission rp
JOIN roles r ON r.role_id = rp.role_id
JOIN permissions p ON p.permission_id = rp.permission_id
WHERE p.permission_name LIKE '%Device Testing%'
ORDER BY r.role_name, p.permission_name;

PRINT 'Permission fix complete.';
