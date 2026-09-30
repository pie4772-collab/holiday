# Cafe24 AI Space 배포 (space_02)

Holiday 프로젝트를 **space_02** (Node.js / Express API + 프론트)에 배포하는 방법입니다.

## 1. Cursor MCP 연결 (필수)

1. **Cursor** → Settings → **MCP**
2. `cafe24-ai-space` 서버 확인 (`https://aih-proxy.cafe24.com/mcp`)
3. **Connect / 로그인** (카페24 OAuth) — 상태가 Connected여야 함
4. 연결 후 채팅에서 다시 요청:

   ```
   space_02에 Holiday 프로젝트 배포해줘
   ```

> MCP가 연결되지 않으면 AI가 배포 API를 호출할 수 없습니다 (`Bearer token required`).

## 2. AI Space 환경 변수 (웹 콘솔)

배포 후 **space_02** → 설정 → 환경 변수:

| 변수 | 값 | 설명 |
|------|-----|------|
| `PORT` | (플랫폼 할당값) | 보통 자동 설정 |
| `HOST` | `0.0.0.0` | |
| `CURRENT_EMPLOYEE_ID` | `13` | 기본 직원 |
| `AS_OF_DATE` | `2026-07-31` | Excel 연차 대장 스냅샷 기준일 |
| `DB_PATH` | 영속 스토리지 경로 | SQLite 파일 (재배포 후에도 유지) |
| `DB_CLIENT` | `postgres` | 설정하면 PostgreSQL 사용. 비우면 SQLite |

`server/.env`도 함께 업로드되지만, **콘솔 환경 변수가 우선**합니다.
PostgreSQL 접속 정보(`DB_HOST`·`DB_PORT`·`DB_NAME`·`DB_USER`·`DB_PASSWORD`)는 Cafe24가 자동 주입하므로 직접 넣지 않습니다.

## 3. DB

### SQLite (기본)

- 초기 데이터: `database/holiday.db` (74명)
- AI Space **영속 스토리지**에 DB 경로를 `DB_PATH`로 지정하세요. 지정하지 않으면 `/app/user_data/holiday.db`를 씁니다.
- 재배포 시 DB가 초기화되지 않도록 백업·복원 기능을 활용하세요.

### PostgreSQL 전환

1. **백업**: `backup_project`로 현재 프로젝트(`/app/user_data/holiday.db` 포함)를 백업하고 다운로드 링크를 보관합니다.
2. **PostgreSQL 연결**: Cafe24 프로젝트에 PostgreSQL을 붙입니다(배포 시 DB `pgsql` 선택). 연결되면 `get_project_status`에 DB 정보가 표시되고 `DB_HOST` 등이 자동 주입됩니다.
3. **전환**: 환경 변수 `DB_CLIENT=postgres`를 설정하고 재배포합니다.
4. 서버가 처음 시작될 때 PostgreSQL이 비어 있으면 `/app/user_data/holiday.db`의 데이터를 자동으로 옮깁니다.
   - 표마다 행 수와 내용을 대조해 모두 일치할 때만 저장합니다. 실패하면 PostgreSQL은 빈 채로 남고 서버 로그에 원인이 표시됩니다.
   - 로그 예: `[db] SQLite → PostgreSQL 이전 완료 (/app/user_data/holiday.db): employees=80, users=80, ...`
   - SQLite 파일은 그대로 남습니다.
5. **확인**: `/health`의 `dbDriver`가 `postgres`, `employees` 수가 기존과 같은지 확인하고, 로그인·연차 신청·결재를 한 번씩 확인합니다.
6. **되돌리기**: `DB_CLIENT`를 삭제하고 재배포하면 SQLite로 돌아갑니다. 단, 전환 후 PostgreSQL에만 기록된 데이터는 SQLite에 없습니다.

> 로컬에서 PostgreSQL로 검증하려면 `powershell -File scripts/run-api-snapshot.ps1 -Driver postgres -PgUrl <접속URL> -Out pg.json` 후
> `node scripts/api-snapshot.mjs --compare before.json pg.json`으로 SQLite 결과와 비교합니다.

## 4. 빌드·실행 (자동 감지)

AI Space는 `package.json`을 보고 Node.js + Express로 인식합니다.

```
npm install
npm start   → prestart에서 vite build 후 node server/index.js
```

- **Node.js 20+** 필요 (`engines` 필드 참고)
- **SQLite** — Node 내장 `node:sqlite` 사용 (네이티브 빌드 불필요). Node 22.13 미만이면 `sql.js`로 자동 전환
- **PostgreSQL** — `DB_CLIENT=postgres`일 때 `pg` 드라이버(순수 JS) 사용
- DB 스키마 변경은 `database/migrations/NNN_설명.sql`로 추가하면 서버 시작 시 한 번 적용됩니다. DB별 문법이 다르면 `NNN_설명.sqlite.sql` / `NNN_설명.postgres.sql`로 나눕니다

## 5. 수동 배포 (MCP 없이)

[AI Space 웹 콘솔](https://hosting.cafe24.com/) → 내 공간 → **space_02** → ZIP 업로드 또는 Git 연동

## 6. 배포 후 확인

- `/health` — `{ status: "ok", employees: 74, dbDriver: "sql.js" | "node:sqlite" | "postgres" }`
- `/` — React 앱 (연차 관리 UI)
- `/admin/roster` — 사원 명부
