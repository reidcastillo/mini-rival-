ALTER TABLE rooms ADD COLUMN ruleset TEXT NOT NULL DEFAULT 'classic' CHECK (ruleset IN ('classic','rumble'));
ALTER TABLE rooms ADD COLUMN powers1 TEXT NOT NULL DEFAULT '{}';
ALTER TABLE rooms ADD COLUMN powers2 TEXT NOT NULL DEFAULT '{}';
CREATE INDEX idx_rooms_ruleset_queue ON rooms(ruleset,status,created);
