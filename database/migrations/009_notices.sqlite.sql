-- 사내 공지. workplace_code 가 NULL 이면 전사 공지입니다.
CREATE TABLE IF NOT EXISTS notices (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  workplace_code  TEXT,
  pinned          INTEGER NOT NULL DEFAULT 0,
  must_read       INTEGER NOT NULL DEFAULT 0,
  author_id       INTEGER,
  created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_notices_list ON notices(pinned, created_at);

-- 필독 공지 확인 기록
CREATE TABLE IF NOT EXISTS notice_reads (
  notice_id    INTEGER NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  employee_id  INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  read_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  PRIMARY KEY (notice_id, employee_id)
);

-- 공지 첨부파일. content 는 암호화한 파일 내용(enc:v1: + base64)입니다.
CREATE TABLE IF NOT EXISTS notice_files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  notice_id   INTEGER NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,
  extension   TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  content     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_notice_files_notice ON notice_files(notice_id, id);
