-- ============================================================
-- Etapa 3.2: Tabelas de Relacionamento para RBAC
-- ============================================================

-- 1. board_members: Controle de acesso ao quadro
CREATE TABLE IF NOT EXISTS board_members (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    board_id uuid NOT NULL REFERENCES task_boards(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    access_level text NOT NULL DEFAULT 'EDITOR',
    created_at timestamptz DEFAULT now(),
    
    CONSTRAINT check_access_level CHECK (access_level IN ('OWNER', 'EDITOR', 'VIEWER')),
    CONSTRAINT unique_board_member UNIQUE (board_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_board_members_board ON board_members(board_id);
CREATE INDEX IF NOT EXISTS idx_board_members_user ON board_members(user_id);

-- 2. teams: Definição de equipes
CREATE TABLE IF NOT EXISTS teams (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. team_members: Associação entre equipes e usuários
CREATE TABLE IF NOT EXISTS team_members (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'MEMBER',
    created_at timestamptz DEFAULT now(),
    
    CONSTRAINT check_team_role CHECK (role IN ('MANAGER', 'MEMBER')),
    CONSTRAINT unique_team_member UNIQUE (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);

-- 4. Normalizar e-mails existentes para minúsculas
UPDATE user_profiles SET email = lower(email) WHERE email != lower(email);

-- Aceitar explicitamente todos os papéis usados pela aplicação.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM user_profiles
        WHERE role IS NULL OR role NOT IN ('SUPERADMIN', 'ADMIN', 'MANAGER', 'USER', 'FUNCIONARIO')
    ) THEN
        RAISE EXCEPTION 'Existem papéis de usuário desconhecidos; migration cancelada sem alterar esses perfis';
    END IF;
END $$;

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS check_user_role;
ALTER TABLE user_profiles
    ADD CONSTRAINT check_user_role
    CHECK (role IN ('SUPERADMIN', 'ADMIN', 'MANAGER', 'USER', 'FUNCIONARIO'));

-- 5. Criar restrição única para e-mail (normalizado)
CREATE UNIQUE INDEX IF NOT EXISTS unique_email_lower ON user_profiles (lower(email));

-- 6. Garantir que o papel SUPERADMIN exista para as contas principais
-- (Substitui a lógica de e-mails hardcoded no código)
UPDATE user_profiles 
SET role = 'SUPERADMIN' 
WHERE lower(email) IN ('contato@incendiobrasilia.com.br', 'deiversonk99@gmail.com')
  AND (role IS NULL OR role != 'SUPERADMIN');

-- 7. Popular board_members para quadros existentes (proprietários se tornam OWNER)
INSERT INTO board_members (board_id, user_id, access_level)
SELECT tb.id, tb.user_id, 'OWNER'
FROM task_boards tb
WHERE tb.user_id IS NOT NULL
ON CONFLICT (board_id, user_id) DO NOTHING;
