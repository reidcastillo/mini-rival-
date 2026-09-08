ALTER TABLE rooms DROP CONSTRAINT rooms_robot_ms_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_robot_ms_check CHECK (robot_ms BETWEEN 30000 AND 60000);
ALTER TABLE rooms ADD COLUMN robot_level TEXT CHECK (robot_level IN ('novice', 'intermediate'));
UPDATE rooms SET robot_level='intermediate' WHERE robot_ms IS NOT NULL;
