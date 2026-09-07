CREATE TABLE players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  room TEXT,
  seen BIGINT NOT NULL
);
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  p1 TEXT NOT NULL REFERENCES players(id),
  p2 TEXT REFERENCES players(id),
  status TEXT NOT NULL CHECK (status IN ('waiting','playing','finished','cancelled')),
  puzzle INTEGER NOT NULL CHECK (puzzle >= 0),
  created BIGINT NOT NULL,
  start BIGINT,
  ended BIGINT,
  winner TEXT REFERENCES players(id),
  a1 TEXT NOT NULL DEFAULT '[]',
  a2 TEXT NOT NULL DEFAULT '[]',
  rev1 INTEGER NOT NULL DEFAULT 0,
  rev2 INTEGER NOT NULL DEFAULT 0,
  CHECK (p1 <> p2),
  CHECK (winner IS NULL OR winner = p1 OR winner = p2)
);
ALTER TABLE players ADD CONSTRAINT players_room_fk FOREIGN KEY (room) REFERENCES rooms(id);
CREATE INDEX idx_rooms_queue ON rooms(status, created);
CREATE INDEX idx_rooms_p1 ON rooms(p1);
CREATE INDEX idx_rooms_p2 ON rooms(p2);
CREATE INDEX idx_rooms_winner ON rooms(winner);
