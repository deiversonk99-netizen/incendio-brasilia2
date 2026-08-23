CREATE OR REPLACE FUNCTION create_task_board_with_default_group(
    p_name text,
    p_user_id uuid,
    p_user_email text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_board_id uuid;
    v_board_record record;
    v_caller_role text;
    v_target_email text;
BEGIN
    SELECT role INTO v_caller_role
    FROM public.user_profiles
    WHERE (id = auth.uid()
       OR (email IS NOT NULL AND lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))))
      AND COALESCE(status, 'ACTIVE') = 'ACTIVE'
    ORDER BY CASE WHEN id = auth.uid() THEN 0 ELSE 1 END
    LIMIT 1;

    IF v_caller_role NOT IN ('ADMIN', 'SUPERADMIN') THEN
        RAISE EXCEPTION 'Apenas ADMIN ou SUPERADMIN pode criar quadros';
    END IF;

    SELECT lower(COALESCE(up.email, au.email)) INTO v_target_email
    FROM auth.users au
    LEFT JOIN public.user_profiles up ON up.id = au.id
    WHERE au.id = p_user_id;

    IF p_user_id IS NULL OR v_target_email IS NULL THEN
        RAISE EXCEPTION 'Usuário destinatário inválido ou sem primeiro acesso';
    END IF;

    IF p_user_email IS NOT NULL AND lower(p_user_email) <> v_target_email THEN
        RAISE EXCEPTION 'O e-mail informado não corresponde ao usuário destinatário';
    END IF;

    IF btrim(COALESCE(p_name, '')) = '' THEN
        RAISE EXCEPTION 'O nome do quadro é obrigatório';
    END IF;

    -- 1. Create the board
    INSERT INTO public.task_boards (name, user_id, user_email, is_visible)
    VALUES (btrim(p_name), p_user_id, v_target_email, true)
    RETURNING * INTO v_board_record;
    
    v_board_id := v_board_record.id;

    -- 2. Create the default "Pendentes" group
    INSERT INTO public.task_groups (name, color, order_index, board_id, user_id)
    VALUES ('Pendentes', 'bg-primary', 0, v_board_id, p_user_id);

    INSERT INTO public.board_members (board_id, user_id, access_level)
    VALUES (v_board_id, p_user_id, 'OWNER')
    ON CONFLICT (board_id, user_id) DO UPDATE SET access_level = 'OWNER';

    RETURN row_to_json(v_board_record);
END;
$$;

REVOKE ALL ON FUNCTION create_task_board_with_default_group(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_task_board_with_default_group(text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION create_task_board_with_default_group(text, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION delete_task_board(p_board_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_caller_role text;
BEGIN
    SELECT role INTO v_caller_role
    FROM public.user_profiles
    WHERE (id = auth.uid()
       OR lower(email) = lower(COALESCE(auth.jwt() ->> 'email', '')))
      AND COALESCE(status, 'ACTIVE') = 'ACTIVE'
    ORDER BY CASE WHEN id = auth.uid() THEN 0 ELSE 1 END
    LIMIT 1;

    IF v_caller_role NOT IN ('ADMIN', 'SUPERADMIN') THEN
        RAISE EXCEPTION 'Apenas ADMIN ou SUPERADMIN pode excluir quadros';
    END IF;

    DELETE FROM public.tasks
    WHERE group_id IN (SELECT id FROM public.task_groups WHERE board_id = p_board_id);
    DELETE FROM public.task_groups WHERE board_id = p_board_id;
    DELETE FROM public.task_boards WHERE id = p_board_id;
END;
$$;

REVOKE ALL ON FUNCTION delete_task_board(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_task_board(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION delete_task_board(uuid) TO authenticated;
