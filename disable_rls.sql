-- Esse script remove as restrições de segurança por linha (RLS) das tabelas
-- permitindo que todos os usuários logados vejam todos os dados, 
-- como Projetos, Tarefas, Clientes, Produtos, etc.

ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE proposals DISABLE ROW LEVEL SECURITY;
ALTER TABLE budget_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE task_boards DISABLE ROW LEVEL SECURITY;
ALTER TABLE task_groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_stock DISABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE floors DISABLE ROW LEVEL SECURITY;
ALTER TABLE kits DISABLE ROW LEVEL SECURITY;
ALTER TABLE services DISABLE ROW LEVEL SECURITY;
ALTER TABLE service_models DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods DISABLE ROW LEVEL SECURITY;
ALTER TABLE execution_schedules DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE project_status_columns DISABLE ROW LEVEL SECURITY;
ALTER TABLE project_label_definitions DISABLE ROW LEVEL SECURITY;

-- Manter RLS na user_profiles pode ser bom para segurança básica de auth, 
-- mas se quiser garantir que todos vejam as permissões, desabilitamos também.
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
