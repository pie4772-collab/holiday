#!/usr/bin/env python3
"""엑셀 사원정보 → SQLite DB 임포트 스크립트"""

import json
import os
import sqlite3
import sys
from pathlib import Path

import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "holiday.db"
SCHEMA_PATH = BASE_DIR / "schema.sql"
LOCAL_COPY = BASE_DIR / "_import_source.xlsx"
AS_OF_DATE = "2026-08-31"
DISPLAY_YEAR = 2026

DEFAULT_EXCEL_DIRS = [
    Path("C:/Users/pie84/OneDrive") / "\ubb38\uc11c",
    Path("C:/Users/pie84/OneDrive") / "\ubb38\uc11c" / "KBI_GroupwareMessenger",
]
EXCEL_GLOBS = ["*260731*\ucee4\uc11c*", "*260731*.xlsx", "*260630*"]


def find_excel_file(explicit_path: str | None = None) -> Path:
    if explicit_path:
        p = Path(explicit_path)
        if p.exists():
            return p
        raise FileNotFoundError(f"파일을 찾을 수 없습니다: {explicit_path}")

    if LOCAL_COPY.exists():
        return LOCAL_COPY

    candidates: list[Path] = []
    for root in DEFAULT_EXCEL_DIRS:
        if not root.exists():
            continue
        for pattern in EXCEL_GLOBS:
            candidates.extend(root.glob(pattern))

    xlsx_files = sorted(
        {p.resolve(): p for p in candidates if p.suffix.lower() == ".xlsx"}.values(),
        key=lambda p: len(p.name),
        reverse=True,
    )

    for path in xlsx_files:
        try:
            pd.read_excel(path, nrows=1)
            return path
        except PermissionError:
            continue

    # OneDrive 전체 fallback
    for root, _, files in os.walk("C:/Users/pie84/OneDrive"):
        for f in files:
            if "260731" in f and f.endswith(".xlsx"):
                p = Path(root) / f
                try:
                    pd.read_excel(p, nrows=1)
                    return p
                except PermissionError:
                    continue

    seed = BASE_DIR / "employees_seed.json"
    if seed.exists():
        raise FileNotFoundError(
            "엑셀 파일을 읽을 수 없습니다. Excel을 닫고 다시 시도하거나 "
            "employees_seed.json 으로 임포트하세요: python import_from_json.py"
        )
    raise FileNotFoundError("연차정리 엑셀 파일을 찾을 수 없습니다.")


def normalize_employees(raw: list[dict]) -> list[dict]:
    seen: dict[str, int] = {}
    result = []
    for emp in raw:
        item = dict(emp)
        emp_no = item.get("emp_no")
        if emp_no:
            if emp_no in seen:
                seen[emp_no] += 1
                item["emp_no"] = f"{emp_no}-{seen[emp_no]}"
            else:
                seen[emp_no] = 1
        result.append(item)
    return result


def _parse_hire_date(value) -> str:
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m-%d")
    text = str(value).strip()
    if text.lower() in ("", "nan", "nat"):
        return ""
    return text[:10]


def _parse_float(value, default=0.0) -> float:
    if pd.isna(value):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _parse_notes(*values) -> str | None:
    parts = []
    for value in values:
        if pd.isna(value):
            continue
        text = str(value).strip()
        if text and text.lower() not in ("nan", "none"):
            parts.append(text)
    return " / ".join(parts) if parts else None


def parse_employees_legacy(df: pd.DataFrame) -> list[dict]:
    df = df.copy()
    df.columns = ["name", "emp_no", "hire_date", "accrued", "used", "remaining", "col6", "notes"]
    df = df.drop(columns=["col6"], errors="ignore")

    rows = []
    for _, r in df.iterrows():
        name = str(r["name"]).strip() if not pd.isna(r["name"]) else ""
        if not name or name in ("성명", "nan"):
            continue

        emp_no = r["emp_no"]
        if pd.isna(emp_no):
            emp_no_val = None
        else:
            try:
                emp_no_val = str(int(float(emp_no)))
            except (ValueError, TypeError):
                emp_no_val = str(emp_no).strip()

        rows.append(
            {
                "name": name,
                "emp_no": emp_no_val,
                "hire_date": _parse_hire_date(r["hire_date"]),
                "accrued": _parse_float(r["accrued"]),
                "used": _parse_float(r["used"]),
                "remaining": _parse_float(r["remaining"]),
                "notes": None if pd.isna(r["notes"]) else str(r["notes"]).strip(),
            }
        )
    return rows


def parse_employees_ledger(df: pd.DataFrame) -> list[dict]:
    """26' 사무직 연차 대장 (260731) 형식"""
    rows = []
    for _, r in df.iterrows():
        name = r.iloc[1]
        if pd.isna(name):
            continue
        name = str(name).strip()
        if not name or name in ("성명", "nan"):
            continue

        emp_no_raw = r.iloc[2]
        if pd.isna(emp_no_raw):
            emp_no_val = None
        else:
            try:
                emp_no_val = str(int(float(emp_no_raw)))
            except (ValueError, TypeError):
                emp_no_val = str(emp_no_raw).strip()

        hire_date = _parse_hire_date(r.iloc[5])
        if not hire_date:
            continue

        rows.append(
            {
                "name": name,
                "emp_no": emp_no_val,
                "hire_date": hire_date,
                "accrued": _parse_float(r.iloc[8]),
                "used": _parse_float(r.iloc[9]),
                "remaining": _parse_float(r.iloc[10]),
                "notes": _parse_notes(r.iloc[12] if len(r) > 12 else None, r.iloc[13] if len(r) > 13 else None),
            }
        )
    return rows


def detect_format(excel_path: Path) -> str:
    preview = pd.read_excel(excel_path, header=None, nrows=6)
    flat = " ".join(str(x) for x in preview.values.flatten() if pd.notna(x))
    if "사무직" in flat or "발생" in preview.iloc[3].astype(str).values:
        return "ledger"
    return "legacy"


def parse_employees(excel_path: Path) -> list[dict]:
    fmt = detect_format(excel_path)
    if fmt == "ledger":
        df = pd.read_excel(excel_path, header=None)
        rows = parse_employees_ledger(df.iloc[4:].reset_index(drop=True))
    else:
        df = pd.read_excel(excel_path, sheet_name=0, header=0)
        rows = parse_employees_legacy(df)

    return normalize_employees(rows)


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))


def import_data(conn: sqlite3.Connection, employees: list[dict], source_path: Path) -> dict:
    conn.execute("DELETE FROM leave_accruals")
    conn.execute("DELETE FROM leave_usages")
    conn.execute("DELETE FROM leave_balance_snapshots")
    conn.execute("DELETE FROM employees")

    inserted = 0
    for emp in employees:
        cursor = conn.execute(
            """
            INSERT INTO employees (emp_no, name, hire_date, notes)
            VALUES (?, ?, ?, ?)
            """,
            (emp["emp_no"], emp["name"], emp["hire_date"], emp["notes"]),
        )
        employee_id = cursor.lastrowid

        conn.execute(
            """
            INSERT INTO leave_balance_snapshots
              (employee_id, as_of_date, display_year, accrued, used, remaining, source_file)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                employee_id,
                AS_OF_DATE,
                DISPLAY_YEAR,
                emp["accrued"],
                emp["used"],
                emp["remaining"],
                source_path.name,
            ),
        )
        inserted += 1

    conn.commit()
    return {"employees": inserted, "as_of_date": AS_OF_DATE}


def export_json(employees: list[dict], path: Path) -> None:
    path.write_text(json.dumps(employees, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    excel_arg = sys.argv[1] if len(sys.argv) > 1 else None
    excel_path = find_excel_file(excel_arg)

    print(f"엑셀 파일: {excel_path}")
    employees = parse_employees(excel_path)
    print(f"사원 수: {len(employees)}")

    export_json(employees, BASE_DIR / "employees_seed.json")

    if DB_PATH.exists():
        DB_PATH.unlink()

    conn = sqlite3.connect(DB_PATH)
    try:
        init_db(conn)
        result = import_data(conn, employees, excel_path)
        print(f"DB 생성 완료: {DB_PATH}")
        print(f"  - 사원 {result['employees']}명 임포트")
        print(f"  - 기준일: {result['as_of_date']}")

        sample = conn.execute(
            """
            SELECT emp_no, name, hire_date, accrued, used, remaining
            FROM v_employee_leave_summary
            ORDER BY name LIMIT 5
            """
        ).fetchall()
        print("\n샘플 데이터:")
        for row in sample:
            print(" ", row)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
