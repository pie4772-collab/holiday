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

`server/.env`도 함께 업로드되지만, **콘솔 환경 변수가 우선**합니다.

## 3. DB (SQLite)

- 초기 데이터: `database/holiday.db` (74명)
- AI Space **영속 스토리지**에 DB 경로를 `DB_PATH`로 지정하세요.
- 재배포 시 DB가 초기화되지 않도록 백업·복원 기능을 활용하세요.

## 4. 빌드·실행 (자동 감지)

AI Space는 `package.json`을 보고 Node.js + Express로 인식합니다.

```
npm install
npm start   → prestart에서 vite build 후 node server/index.js
```

- **Node.js 20+** 필요 (`engines` 필드 참고)
- **better-sqlite3** — Linux에서 `npm install` 시 네이티브 빌드

## 5. 수동 배포 (MCP 없이)

[AI Space 웹 콘솔](https://hosting.cafe24.com/) → 내 공간 → **space_02** → ZIP 업로드 또는 Git 연동

## 6. 배포 후 확인

- `/health` — `{ status: "ok", employees: 74 }`
- `/` — React 앱 (연차 관리 UI)
- `/admin/roster` — 사원 명부
