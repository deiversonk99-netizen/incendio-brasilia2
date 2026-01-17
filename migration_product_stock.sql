-- 1. ADICIONAR COLUNAS AO CATÁLOGO DE PRODUTOS
ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS storage_location TEXT;

-- 2. CRIAR TABELA DE MOVIMENTAÇÃO DE ESTOQUE DE PRODUTOS
CREATE TABLE IF NOT EXISTS product_stock (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES product_catalog(id) ON DELETE CASCADE,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('IN', 'OUT', 'ADJUST')),
    quantity NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id)
);

-- Habilitar RLS
ALTER TABLE product_stock ENABLE ROW LEVEL SECURITY;

-- Polices (Acesso público para usuários autenticados conforme conversa f717d7e1)
CREATE POLICY "Public product_stock access for authenticated users" ON product_stock
    FOR ALL USING (auth.role() = 'authenticated');
