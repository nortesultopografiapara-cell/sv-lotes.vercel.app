ALTER TABLE lots
ADD COLUMN IF NOT EXISTS project_id uuid;

ALTER TABLE lots
DROP CONSTRAINT IF EXISTS fk_lots_project;

ALTER TABLE lots
ADD CONSTRAINT fk_lots_project
FOREIGN KEY (project_id)
REFERENCES projects(id)
ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_lots_project_id
ON lots(project_id);

-- Also do for lotes if it exists
DO $
BEGIN
   IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lotes') THEN
      ALTER TABLE lotes ADD COLUMN IF NOT EXISTS project_id uuid;
      
      BEGIN
          ALTER TABLE lotes
          ADD CONSTRAINT fk_lotes_project
          FOREIGN KEY (project_id)
          REFERENCES projects(id)
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN
          NULL;
      END;

      CREATE INDEX IF NOT EXISTS idx_lotes_project_id ON lotes(project_id);
   END IF;
END $;
