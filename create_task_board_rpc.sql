CREATE OR REPLACE FUNCTION create_task_board_with_default_group(
    p_name text,
    p_user_id uuid,
    p_user_email text
)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
    v_board_id uuid;
    v_board_record record;
BEGIN
    -- 1. Create the board
    INSERT INTO task_boards (name, user_id, user_email)
    VALUES (p_name, p_user_id, p_user_email)
    RETURNING * INTO v_board_record;
    
    v_board_id := v_board_record.id;

    -- 2. Create the default "Pendentes" group
    INSERT INTO task_groups (name, color, order_index, board_id, user_id)
    VALUES ('Pendentes', 'bg-primary', 0, v_board_id, p_user_id);

    RETURN row_to_json(v_board_record);
END;
$$;
