#!/usr/bin/env python3
"""employees_seed.json → SQLite DB 임포트 (엑셀 없을 때 사용)"""

import json
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "holiday.db"
SCHEMA_PATH = BASE_DIR / "schema.sql"
SEED_PATH = BASE_DIR / "employees_seed.json"
AS_OF_DATE = "2026-06-30"
DISPLAY_YEAR = 2026


def main() -> None:
    if not SEED_PATH.exists():
        raise FileNotFoundError(f"시드 파일이 없습니다: {SEED_PATH}")

    employees = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    print(f"시드 사원 수: {len(employees)}")

    if DB_PATH.exists():
        DB_PATH.unlink()

    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        for emp in employees:
            cur = conn.execute(
                "INSERT INTO employees (emp_no, name, hire_date, notes) VALUES (?, ?, ?, ?)",
                (emp["emp_no"], emp["name"], emp["hire_date"], emp.get("notes")),
            )
            conn.execute(
                """
                INSERT INTO leave_balance_snapshots
                  (employee_id, as_of_date, display_year, accrued, used, remaining, source_file)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    cur.lastrowid,
                    AS_OF_DATE,
                    DISPLAY_YEAR,
                    emp["accrued"],
                    emp["used"],
                    emp["remaining"],
                    "employees_seed.json",
                ),
            )
        conn.commit()
        print(f"DB 생성 완료: {DB_PATH} ({len(employees)}명)")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
