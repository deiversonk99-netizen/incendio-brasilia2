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

export const TASK_CENTRAL_USERS = [
    'contato@incendiobrasilia.com.br',
    'deiversonk99@gmail.com',
    'incendiobrasilia@gmail.com',
    'cleodson.batata@gmail.com'
];

export const isSuperAdmin = (email?: string) => {
    if (!email) return false;
    return SUPER_ADMINS.includes(email.toLowerCase());
};

export const isStockAdmin = (email?: string) => {
    if (!email) return false;
    return STOCK_ADMINS.includes(email.toLowerCase());
};

export const isTaskCentralUser = (email?: string) => {
    if (!email) return false;
    return TASK_CENTRAL_USERS.includes(email.toLowerCase());
};
