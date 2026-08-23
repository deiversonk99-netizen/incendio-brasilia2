/**
 * Role-Based Access Control (RBAC) Configuration
 * 
 * Todas as permissões agora são derivadas exclusivamente do campo `role`
 * no perfil do usuário. Listas de e-mail hardcoded foram removidas.
 * 
 * Hierarquia de papéis:
 *   SUPERADMIN > ADMIN > MANAGER > FUNCIONARIO = USER
 */

export type UserRole = 'SUPERADMIN' | 'ADMIN' | 'MANAGER' | 'USER' | 'FUNCIONARIO';

const ROLE_HIERARCHY: Record<UserRole, number> = {
    SUPERADMIN: 100,
    ADMIN: 80,
    MANAGER: 60,
    FUNCIONARIO: 20,
    USER: 20,
};

/**
 * Retorna o papel do perfil, com fallback seguro para 'USER'.
 */
const getRole = (profile?: any): UserRole => {
    if (!profile?.role) return 'USER';
    return profile.role as UserRole;
};

/**
 * Verifica se o papel do usuário é >= ao papel mínimo exigido.
 */
export const hasMinRole = (profile?: any, minRole: UserRole = 'USER'): boolean => {
    const userRole = getRole(profile);
    return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole];
};

/**
 * Verifica se o usuário é SUPERADMIN.
 * Mantém a assinatura antiga para compatibilidade, mas agora é puramente role-based.
 */
export const isSuperAdmin = (email?: string, profile?: any): boolean => {
    return getRole(profile) === 'SUPERADMIN';
};

/**
 * Verifica se o usuário pode acessar o módulo de Monitoramento de Equipe
 * e funcionalidades centrais de tarefas.
 * Requer MANAGER, ADMIN ou SUPERADMIN.
 */
export const isTaskCentralUser = (email?: string, profile?: any): boolean => {
    return hasMinRole(profile, 'MANAGER');
};

/**
 * Verifica se o usuário pode delegar tarefas a outros.
 * USER/FUNCIONARIO só podem atribuir para si mesmos.
 */
export const canDelegateTask = (profile?: any): boolean => {
    return hasMinRole(profile, 'MANAGER');
};

/**
 * Verifica se o usuário pode gerenciar quadros (criar, editar, excluir).
 * Requer ADMIN ou SUPERADMIN. MANAGER apenas monitora/delega tarefas.
 */
export const canManageBoards = (profile?: any): boolean => {
    return hasMinRole(profile, 'ADMIN');
};

/**
 * Verifica se o usuário pode gerenciar outros usuários.
 * Requer ADMIN ou SUPERADMIN.
 */
export const canManageUsers = (profile?: any): boolean => {
    return hasMinRole(profile, 'ADMIN');
};

/**
 * Verifica se o usuário pode promover/rebaixar outros para ADMIN.
 * Exclusivo de SUPERADMIN.
 */
export const canPromoteToAdmin = (profile?: any): boolean => {
    return getRole(profile) === 'SUPERADMIN';
};

/**
 * Controle de visibilidade de abas/módulos.
 * Respeita permissões dinâmicas (profile.permissions) como prioridade,
 * com fallback para a matriz RBAC.
 */
export const canViewTab = (viewId: string, email?: string, profile?: any): boolean => {
    if (!email) return false;

    const role = getRole(profile);

    // TEAM_TASKS requer ser pelo menos MANAGER
    if (viewId === 'TEAM_TASKS') {
        return isTaskCentralUser(email, profile);
    }

    // ADMIN_BOARDS requer ADMIN ou SUPERADMIN
    if (viewId === 'ADMIN_BOARDS') {
        return canManageBoards(profile);
    }

    // SETTINGS requer ADMIN
    if (viewId === 'SETTINGS') {
        return hasMinRole(profile, 'ADMIN');
    }

    // 1. Permissões dinâmicas do perfil (configuradas no painel Settings)
    if (profile?.permissions && profile.permissions[viewId] !== undefined) {
        // SUPERADMIN e ADMIN não podem ser bloqueados de áreas vitais
        if (hasMinRole(profile, 'ADMIN') && (viewId === 'SETTINGS' || viewId === 'DASHBOARD' || viewId === 'ADMIN_BOARDS')) {
            return true;
        }
        return profile.permissions[viewId] === true;
    }

    // 2. SUPERADMIN e ADMIN vêem tudo por padrão
    if (hasMinRole(profile, 'ADMIN')) return true;

    // 3. Default: visível a todos (exceto os que foram bloqueados acima)
    return true;
};

// Aliases de compatibilidade (usados em imports existentes)
export const isStockAdmin = (email?: string, profile?: any) => canViewTab('PLACAS', email, profile);
export const isFinanceAdmin = (email?: string, profile?: any) => canViewTab('FINANCE', email, profile);
export const isProposalAdmin = (email?: string, profile?: any) => canViewTab('ENG_A', email, profile);
