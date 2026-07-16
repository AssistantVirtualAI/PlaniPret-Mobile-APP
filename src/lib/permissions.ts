export type Permission =
  | 'read:conversations'
  | 'create:conversations'
  | 'edit:conversations'
  | 'delete:conversations'
  | 'read:analytics'
  | 'read:knowledge_base'
  | 'create:knowledge_base'
  | 'edit:knowledge_base'
  | 'delete:knowledge_base'
  | 'read:agent_config'
  | 'edit:agent_config'
  | 'read:integrations'
  | 'edit:integrations'
  | 'manage:members'
  | 'manage:roles'
  | 'manage:organization'
  | 'manage:api_keys'
  | 'manage:permissions'
  | 'export:org_data'
  | 'export:audit_logs'
  | 'read:exports'
  | 'read:notifications'
  | 'read:security_audit'
  | 'run:security_audit';

export type Role = 'super_admin' | 'org_admin' | 'manager' | 'agent' | 'viewer' | 'planipret_admin' | 'planipret_broker';

export const DEFAULT_PERMISSIONS_MATRIX: Record<Role, Permission[]> = {
  super_admin: [
    'read:conversations',
    'create:conversations',
    'edit:conversations',
    'delete:conversations',
    'read:analytics',
    'read:knowledge_base',
    'create:knowledge_base',
    'edit:knowledge_base',
    'delete:knowledge_base',
    'read:agent_config',
    'edit:agent_config',
    'read:integrations',
    'edit:integrations',
    'manage:members',
    'manage:roles',
    'manage:organization',
    'manage:api_keys',
    'manage:permissions',
    'export:org_data',
    'export:audit_logs',
    'read:exports',
    'read:notifications',
    'read:security_audit',
    'run:security_audit',
  ],
  org_admin: [
    'read:conversations',
    'create:conversations',
    'edit:conversations',
    'delete:conversations',
    'read:analytics',
    'read:knowledge_base',
    'create:knowledge_base',
    'edit:knowledge_base',
    'delete:knowledge_base',
    'read:agent_config',
    'edit:agent_config',
    'read:integrations',
    'edit:integrations',
    'manage:members',
    'manage:roles',
    'manage:organization',
    'manage:api_keys',
    'manage:permissions',
    'export:org_data',
    'export:audit_logs',
    'read:exports',
    'read:notifications',
    'read:security_audit',
    'run:security_audit',
  ],
  manager: [
    'read:conversations',
    'create:conversations',
    'edit:conversations',
    'delete:conversations',
    'read:analytics',
    'read:knowledge_base',
    'create:knowledge_base',
    'edit:knowledge_base',
    'delete:knowledge_base',
    'read:agent_config',
    'edit:agent_config',
    'manage:members',
    'read:notifications',
    'read:security_audit',
    'run:security_audit',
  ],
  agent: [
    'read:conversations',
    'create:conversations',
    'edit:conversations',
    'read:analytics',
    'read:knowledge_base',
    'create:knowledge_base',
    'edit:knowledge_base',
    'read:agent_config',
  ],
  viewer: ['read:conversations', 'read:analytics', 'read:knowledge_base', 'read:agent_config'],
  planipret_admin: [
    'read:conversations',
    'read:analytics',
    'manage:members',
    'manage:organization',
    'read:notifications',
  ],
  planipret_broker: [
    'read:conversations',
    'read:notifications',
  ],
};

export const ALL_PERMISSIONS = Array.from(
  new Set<Permission>(Object.values(DEFAULT_PERMISSIONS_MATRIX).flat()),
) as Permission[];
