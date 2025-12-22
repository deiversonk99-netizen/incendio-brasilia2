
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
  SETTINGS = 'SETTINGS'
}

export interface Project {
  id: string;
  name: string;
  client: string;
  status: 'ANALYSIS' | 'APPROVED' | 'EXECUTION' | 'DONE';
  team: string[];
  value: number;
  deadline: string;
  type: 'business' | 'factory' | 'store';
  blueprint_url?: string;
}

export interface Task {
  id: string;
  title: string;
  deadline: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  completed: boolean;
  project?: string;
  assignee?: string;
  status: 'PENDING' | 'BUYING' | 'INSTALLATION' | 'DONE';
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
}

export interface Product {
  id: string;
  name: string;
  price: number;
  unit?: string;
  category?: string;
  created_at?: string;
  user_id?: string;
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
  status: 'DRAFT' | 'SENT' | 'APPROVED';
  created_at?: string;
}
