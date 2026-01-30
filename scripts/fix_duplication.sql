-- SCRIPT PARA CORRIGIR DUPLICAÇÃO DE PROJETOS (VERSÃO COM BYPASS DE RLS)
-- Rode este script no SQL Editor do seu painel Supabase.

-- Primeiro, removemos a versão anterior para garantir a atualização das permissões
DROP FUNCTION IF EXISTS public.clone_project_data(uuid, text);

CREATE OR REPLACE FUNCTION public.clone_project_data(source_project_id uuid, new_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER -- Permite ignorar as restrições de RLS durante a execução
 SET search_path = public -- Recomendado para funções SECURITY DEFINER
 AS $function$
DECLARE
    new_project_id UUID;
    current_user_id UUID;
BEGIN
    -- Pegamos o ID do usuário que está chamando a função
    current_user_id := auth.uid();

    -- 1. Clonar o Projeto
    INSERT INTO projects (
        name, client, status, user_id, blueprint_url, internal_observations, value, deadline, type
    )
    SELECT 
        new_name, client, status, COALESCE(current_user_id, user_id), blueprint_url, internal_observations, value, deadline, type
    FROM projects
    WHERE id = source_project_id
    RETURNING id INTO new_project_id;

    -- 2. Clonar serviços vinculados ao projeto
    INSERT INTO project_services (project_id, service_id)
    SELECT new_project_id, service_id
    FROM project_services
    WHERE project_id = source_project_id;

    -- 3. Clonar pavimentos (Fase A)
    INSERT INTO floors (project_id, name, type, prancha, width, length, height, replication_factor, calculation_type, items)
    SELECT new_project_id, name, type, prancha, width, length, height, replication_factor, calculation_type, items
    FROM floors
    WHERE project_id = source_project_id;

    -- 4. Clonar itens do orçamento (Fase B/C)
    INSERT INTO budget_items (project_id, name, quantity_calculated, quantity_final, unit_price, cost_price, origin, item_type)
    SELECT new_project_id, name, quantity_calculated, quantity_final, unit_price, cost_price, origin, item_type
    FROM budget_items
    WHERE project_id = source_project_id;

    -- 5. Clonar proposta (Fase C)
    INSERT INTO proposals (
        project_id, user_id, cost_material_base, bdi_percent, profit_percent, 
        discount_type, discount_value, payment_conditions, execution_schedule, 
        validity_days, observations, hide_services_pdf, hide_products_pdf, status, proposal_number
    )
    SELECT 
        new_project_id, COALESCE(current_user_id, user_id), cost_material_base, bdi_percent, profit_percent, 
        discount_type, discount_value, payment_conditions, execution_schedule, 
        validity_days, observations, hide_services_pdf, hide_products_pdf, status, 
        (SELECT COALESCE(MAX(proposal_number), 0) + 1 FROM proposals)
    FROM proposals
    WHERE project_id = source_project_id;

    -- 6. Clonar seções da proposta
    INSERT INTO proposal_sections (project_id, title, content, order_index, is_active)
    SELECT new_project_id, title, content, order_index, is_active
    FROM proposal_sections
    WHERE project_id = source_project_id;

    -- 7. Clonar configurações de PDF
    INSERT INTO pdf_settings (project_id, phase, variables)
    SELECT new_project_id, phase, variables
    FROM pdf_settings
    WHERE project_id = source_project_id;

    RETURN new_project_id;
END;
$function$;
