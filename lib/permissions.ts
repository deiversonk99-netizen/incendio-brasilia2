/**
 * Role-Based Access Control (RBAC) Configuration
 */

export const SUPER_ADMINS = [
    'contato@incendiobrasilia.com.br',
    'deiversonk99@gmail.com'
];

export const STOCK_ADMINS = [
    ...SUPER_ADMINS,
    'preraldovasconcelos@gmail.com',
    'cleodson.batata@gmail.com',
    'franciscoeudes7891@gmail.com'
];

export const FINANCE_ADMINS = [
    ...SUPER_ADMINS,
    'incendiobrasilia@gmail.com',
    'cleodson.batata@gmail.com'
];

export const PROPOSAL_ADMINS = [
    ...SUPER_ADMINS,
    'incendiobrasilia@gmail.com',
    'cleodson.batata@gmail.com'
];

export const TASK_CENTRAL_USERS = [
    ...SUPER_ADMINS,
    'incendiobrasilia@gmail.com',
    'cleodson.batata@gmail.com'
];

export const isSuperAdmin = (email?: string, profile?: any) => {
    if (!email) return false;
    // Hardcoded master admins always have full access
    if (SUPER_ADMINS.includes(email.toLowerCase())) return true;
    if (profile?.role === 'ADMIN') return true;
    return false;
};

export const canViewTab = (viewId: string, email?: string, profile?: any) => {
    if (!email) return false;

    // Super admins see everything
    if (isSuperAdmin(email, profile)) return true;

    // 1. Check dynamic permissions (Top Priority)
    // If a tab is explicitly marked as true or false in the profile, we respect that.
    if (profile?.permissions && profile.permissions[viewId] !== undefined) {
        return profile.permissions[viewId] === true;
    }

    // 2. Default RBAC fallbacks (If not explicitly permitted/denied)
    const role = profile?.role || 'USER';

    // Groups logic (Whitelist based on emails)
    if (viewId === 'FINANCE') {
        if (FINANCE_ADMINS.includes(email.toLowerCase())) return true;
        return role === 'ADMIN';
    }

    if (viewId === 'PLACAS' || viewId === 'STOCK' || viewId === 'SUPPLIERS') {
        if (STOCK_ADMINS.includes(email.toLowerCase())) return true;
        return role === 'ADMIN' || role === 'MANAGER';
    }

    if (viewId.startsWith('ENG_')) {
        if (PROPOSAL_ADMINS.includes(email.toLowerCase())) return true;
        return role === 'ADMIN' || role === 'MANAGER';
    }

    // Special case for FUNCIONARIO role default visibility
    if (role === 'FUNCIONARIO') {
        return viewId === 'PLACAS' || viewId === 'STOCK';
    }

    // Tabs only visible to Staff by default
    const staffOnlyTabs = [
        'DASHBOARD', 'CLIENTS', 'TASKS', 'KITS', 'CATALOG',
        'SERVICES', 'SERVICE_MODELS', 'RENEWALS', 'SETTINGS'
    ];

    if (staffOnlyTabs.includes(viewId)) {
        return role === 'ADMIN' || role === 'MANAGER';
    }

    // Default: visible to anyone (e.g. basic landing views if any exist)
    return true;
};

export const isStockAdmin = (email?: string, profile?: any) => canViewTab('PLACAS', email, profile);
export const isFinanceAdmin = (email?: string, profile?: any) => canViewTab('FINANCE', email, profile);
export const isProposalAdmin = (email?: string, profile?: any) => canViewTab('ENG_A', email, profile);
export const isTaskCentralUser = (email?: string, profile?: any) => {
    if (!email) return false;
    if (isSuperAdmin(email, profile)) return true;
    if (TASK_CENTRAL_USERS.includes(email.toLowerCase())) return true;
    return profile?.role === 'ADMIN' || profile?.role === 'MANAGER';
};
