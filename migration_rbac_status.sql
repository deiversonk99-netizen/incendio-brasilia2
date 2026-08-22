-- Etapa 2.1: Adicionar a coluna status na tabela user_profiles
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'ACTIVE';

-- Atualiza os registros existentes
UPDATE user_profiles 
SET status = 'ACTIVE' 
WHERE status IS NULL;

-- Garante que o status só tenha valores permitidos
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_user_status'
    ) THEN
        ALTER TABLE user_profiles 
        ADD CONSTRAINT check_user_status 
        CHECK (status IN ('INVITED', 'ACTIVE', 'BLOCKED'));
    END IF;
END $$;
