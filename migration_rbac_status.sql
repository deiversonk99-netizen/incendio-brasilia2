-- Etapa 2.1: Adicionar a coluna status na tabela user_profiles
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS status text;

-- Atualiza os registros existentes
UPDATE user_profiles 
SET status = CASE WHEN id IS NULL THEN 'INVITED' ELSE 'ACTIVE' END
WHERE status IS NULL;

-- Novos perfis criados pelo painel aguardam o primeiro acesso autenticado.
ALTER TABLE user_profiles ALTER COLUMN status SET DEFAULT 'INVITED';

-- Valores legados desconhecidos ficam bloqueados até revisão administrativa.
UPDATE user_profiles
SET status = 'BLOCKED'
WHERE status NOT IN ('INVITED', 'ACTIVE', 'BLOCKED');

-- Garante que o status só tenha valores permitidos
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS check_user_status;
ALTER TABLE user_profiles
ADD CONSTRAINT check_user_status
CHECK (status IN ('INVITED', 'ACTIVE', 'BLOCKED'));
