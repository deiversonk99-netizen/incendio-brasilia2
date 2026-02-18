
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'assignee') THEN
        ALTER TABLE tasks ADD COLUMN assignee UUID REFERENCES auth.users(id);
    END IF;
END $$;
