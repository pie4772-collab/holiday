#!/usr/bin/env python3
"""SQLite DB 조회 유틸리티"""

import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "holiday.db"


def main() -> None:
    if not DB_PATH.exists():
        print(f"DB 파일이 없습니다. 먼저 import_from_excel.py 를 실행하세요.")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    print(f"=== holiday.db ({DB_PATH}) ===\n")

    summary = conn.execute(
        """
        SELECT
          (SELECT COUNT(*) FROM employees) AS employees,
          (SELECT COUNT(*) FROM leave_balance_snapshots) AS balances,
          (SELECT ROUND(AVG(remaining), 1) FROM leave_balance_snapshots) AS avg_remaining,
          (SELECT as_of_date FROM leave_balance_snapshots LIMIT 1) AS as_of_date
        """
    ).fetchone()
    print(f"사원 수      : {summary['employees']}")
    print(f"연차 스냅샷  : {summary['balances']}")
    print(f"평균 잔여    : {summary['avg_remaining']}일")
    print(f"기준일       : {summary['as_of_date']}\n")

    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    rows = conn.execute(
        """
        SELECT emp_no, name, hire_date, accrued, used, remaining
        FROM v_employee_leave_summary
        ORDER BY name
        LIMIT ?
        """,
        (limit,),
    ).fetchall()

    print(f"{'사번':<10} {'성명':<8} {'입사일':<12} {'발생':>5} {'사용':>5} {'잔여':>5}")
    print("-" * 52)
    for r in rows:
        emp_no = r["emp_no"] or "-"
        print(
            f"{emp_no:<10} {r['name']:<8} {r['hire_date']:<12} "
            f"{r['accrued']:>5} {r['used']:>5} {r['remaining']:>5}"
        )

    conn.close()


if __name__ == "__main__":
    main()
