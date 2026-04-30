
export enum AppView {
  DASHBOARD = 'DASHBOARD',
  PROJECTS = 'PROJECTS',
  FINANCE = 'FINANCE',
  TASKS = 'TASKS',
  CLIENTS = 'CLIENTS',
  ENGINEERING_PHASE_A = 'ENG_A',
  ENGINEERING_PHASE_B = 'ENG_B',
  ENGINEERING_PHASE_C = 'ENG_C',
  KITS = 'KITS',
  CATALOG = 'CATALOG',
  SUPPLIERS = 'SUPPLIERS',
  SERVICES = 'SERVICES',
  SERVICE_MODELS = 'SERVICE_MODELS',
  PLACAS = 'PLACAS',
  STOCK = 'STOCK',
  RENEWALS = 'RENEWALS',
  SETTINGS = 'SETTINGS',
  TEAM_TASKS = 'TEAM_TASKS',
  ADMIN_BOARDS = 'ADMIN_BOARDS'
}

export interface StatusColumn {
  id: string;
  label: string;
  color: string;
  shadow_class: string;
  order_index: number;
  project_types?: string[];
  allowed_labels?: string[];
  allowed_clients?: string[];
}

export interface Project {
  id: string;
  name: string;
  client: string;
  status: string; // Was: 'ANALYSIS' | 'APPROVED' | 'EXECUTION' | 'DONE'
  team: string[];
  value: number;
  deadline: string;
  type: 'business' | 'factory' | 'store' | 'residential' | string;
  blueprint_url?: string;
  internal_observations?: string;
  project_number?: number;
  label_color?: string;
  created_at?: string;
}

export interface Task {
  id: string;
  title: string;
  deadline?: string;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  completed?: boolean;
  project?: string;
  assignee?: string;
  status?: string;
  expiration_date?: string;
  is_annual?: boolean;
  description?: string;
  group_id?: string;
  file_url?: string;
  label_color?: string;
  project_id?: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  category: string;
  entity: string;
  status: 'PAID' | 'PENDING';
  value: number;
  type: 'INCOME' | 'EXPENSE';
  installment_number?: number;
  total_installments?: number;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  unit?: string;
  category?: string;
  created_at?: string;
  user_id?: string;
  supplier_id?: string;
  is_signage?: boolean;
  cost_price?: number;
  observation?: string;
  registration_date?: string;
  image?: string;
  storage_location?: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  tax_id?: string;
  created_at?: string;
}

export interface SupplierPurchase {
  id: string;
  supplier_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  purchase_date: string;
  notes?: string;
  created_at?: string;
  // Joins
  products?: Product;
}

export interface Proposal {
  id: string;
  project_id: string;
  user_id?: string;
  cost_material_base: number;
  bdi_percent: number;
  profit_percent: number;
  discount_type: 'PERCENTAGE' | 'FIXED';
  discount_value: number;
  payment_conditions: string;
  execution_schedule: string;
  validity_days: number;
  observations?: string;
  hide_services_pdf?: boolean;
  hide_products_pdf?: boolean;
  status: 'DRAFT' | 'SENT' | 'APPROVED';
  created_at?: string;
  proposal_number?: number;
  proposal_date?: string;
}

export interface BudgetItem {
  id: string;
  project_id: string;
  name: string;
  quantity_calculated: number;
  quantity_final: number;
  unit_price: number;
  cost_price?: number;
  origin: 'CALCULATED' | 'MANUAL';
  item_type: 'PRODUCT' | 'SERVICE' | 'CUSTOM';
  apply_bdi?: boolean;
  apply_profit?: boolean;
  observation?: string;
  created_at?: string;
}

export interface ServiceModelItem {
  id: string;
  service_model_id: string;
  product_id: string;
  quantity: number;
  // Joins
  product?: Product;
}

export interface ServiceModel {
  id: string;
  name: string;
  description: string;
  labor_price: number;
  user_id?: string;
  items?: ServiceModelItem[];
  // Calculated
  total_products_price?: number;
  total_price?: number;
}
