ALTER TABLE rooms ADD COLUMN robot_ms INTEGER CHECK (robot_ms BETWEEN 30000 AND 45000);
UPDATE players SET name=regexp_replace(name, ' [A-F0-9]{4}$', '');
