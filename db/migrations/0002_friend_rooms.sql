ALTER TABLE rooms ADD COLUMN friend_code TEXT;
ALTER TABLE rooms ADD COLUMN ready1 BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE rooms ADD COLUMN ready2 BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE rooms ADD COLUMN next_room TEXT REFERENCES rooms(id);
CREATE INDEX idx_rooms_friend_code ON rooms(friend_code, created DESC) WHERE friend_code IS NOT NULL;
CREATE UNIQUE INDEX idx_rooms_friend_active ON rooms(friend_code) WHERE friend_code IS NOT NULL AND status IN ('waiting','playing');
