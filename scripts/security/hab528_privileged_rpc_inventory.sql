-- HAB-528: read-only, signature-level SECURITY DEFINER inventory.
-- Run via psql in an authorized isolated/local database:
--   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/security/hab528_privileged_rpc_inventory.sql
-- Treat output as SENSITIVE: it reveals the privileged attack surface.
-- Never publish production output in CI artifacts or public issues.
-- Review *effective* grants including PUBLIC inheritance, not only explicit ACLs.
\pset pager off
\pset null '[null]'
SELECT
  p.oid::regprocedure::text AS function_signature,
  pg_get_userbyid(p.proowner) AS owner_name,
  p.prosecdef AS security_definer,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role_execute,
  coalesce(array_to_string(p.proconfig,', '),'') AS function_config,
  pg_get_function_result(p.oid) AS return_type,
  CASE WHEN p.prorettype='trigger'::regtype THEN 'trigger'
       WHEN p.proretset THEN 'set_returning' ELSE 'function' END AS execution_shape,
  CASE WHEN p.proconfig IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM unnest(p.proconfig) setting
           WHERE setting LIKE 'search_path=%'
        ) THEN 'REVIEW_SEARCH_PATH'
       ELSE 'configured' END AS search_path_status
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
ORDER BY
  (has_function_privilege('anon',p.oid,'EXECUTE')) DESC,
  (has_function_privilege('authenticated',p.oid,'EXECUTE')) DESC,
  p.proname, p.oid::regprocedure::text;

-- Default ACLs affect future migrations, and every overload is distinct.
SELECT
  n.nspname AS schema_name,
  pg_get_userbyid(d.defaclrole) AS grant_owner,
  d.defaclobjtype AS object_type,
  coalesce(array_to_string(d.defaclacl,', '),'') AS default_acl
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
WHERE d.defaclobjtype='f'
  AND (n.nspname='public' OR d.defaclnamespace=0)
ORDER BY schema_name,grant_owner;

-- This inventory is evidence for human classification, NEVER an automatic pass.
