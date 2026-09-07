# Holiday — 연차 관리 시스템

사내 연차 발생·사용·잔여를 관리하는 웹 앱입니다.  
프론트엔드(React)와 API(Express)를 **3001 포트 하나**로 서빙하며, PC·모바일 브라우저 모두 지원합니다.

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프론트 | React 19, Vite, Tailwind CSS v4, React Query, Zustand, React Router |
| 백엔드 | Express 5, better-sqlite3 |
| DB | SQLite (`database/holiday.db`) |

---

## 실행 방법

### 권장 (Windows)

```powershell
# 기존 서버 종료 → 빌드 → 실행 (한 번에)
npm run restart
```

또는 프로젝트 루트의 **`start-holiday.bat`** 더블클릭.

> 서버 창을 닫으면 앱도 종료됩니다. `Ctrl+C`로 종료할 수 있습니다.

### npm 스크립트

| 명령 | 설명 |
|------|------|
| `npm run restart` | 기존 3001 포트 프로세스 종료 후 `prod` 실행 (**일반 사용 권장**) |
| `npm run prod` | 프론트 빌드 + 서버 시작 |
| `npm run start` | 빌드 없이 서버만 시작 (`dist/` 필요) |
| `npm run dev:all` | 개발 모드 (Vite 5173 + API 3001, 핫 리로드) |
| `npm run db:import` | Excel 연차 대장 → SQLite 임포트 |
| `npm run db:query` | DB 조회 유틸 |

### 접속 주소

- **본인 PC**: http://localhost:3001
- **동료/모바일 (같은 Wi-Fi)**: http://\<PC IP\>:3001  
  → 관리자 사이드바 또는 `/health` 응답의 `shareUrl` 확인

---

## 설정 (`server/.env`)

```env
PORT=3001              # 서비스 포트
HOST=0.0.0.0           # 0.0.0.0 = LAN 접속 허용
CURRENT_EMPLOYEE_ID=13 # 로그인 없이 사용하는 기본 직원 DB id (박지은)
AS_OF_DATE=2026-08-31  # 연차 계산·스냅샷 기준일
```

- **LAN IP**는 `.env`에 고정하지 않습니다. 서버 시작 시 **자동 감지**합니다.
- Wi-Fi IP가 바뀌면 `shareUrl`도 함께 바뀝니다. 모바일 접속 시 항상 최신 URL을 확인하세요.

---

## 주요 화면

| 경로 | 설명 |
|------|------|
| `/employee` | 직원 대시보드 (잔여 연차, 규칙 안내) |
| `/employee/history` | 연차 발생 내역 |
| `/employee/calendar` | 사용 캘린더 |
| `/employee/request` | 연차 신청 |
| `/admin` | 관리자 Overview |
| `/admin/roster` | **사원 명부** (입사·수정·퇴사·재직) |
| `/admin/employees` | 직원 연차 현황 (사번 포함) |
| `/admin/leave-manage` | 직원별 발생·사용 수정 |

### UI

- Stripe Dashboard 스타일 (다크 사이드바, 보라 accent)
- **모바일**: 상단 헤더 + 하단 탭 / **768px 이상**: 좌측 사이드바
- 목록(직원·사원 명부): 모바일 카드 / PC 테이블

---

## 연차 계산 규칙 (`src/utils/leaveCalculations.js`)

- **회계 기준일**: 매년 **1월 1일**
- **첫해**: 입사 후 월 1개 (최대 11), 일사일에 정산
- **비례 연차**: 1년 도달 ~ 첫 1/1 전
- **정규 연차**: 매 1/1 발생
- **근속 가산**: 정규 연차 **최초 발생일**(비례 연차 이후 첫 1/1)부터 계산

---

## API 요약

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/health` | 상태, 직원 수, `shareUrl` |
| GET | `/api/employees` | 재직 직원 + 연차 요약 |
| GET | `/api/admin/roster` | 사원 명부 (퇴사자 포함 옵션) |
| POST | `/api/admin/employees` | 입사 등록 |
| PUT | `/api/admin/employees/:id` | 정보 수정 |
| POST | `/api/admin/employees/:id/terminate` | 퇴사 처리 |
| POST | `/api/admin/employees/:id/reactivate` | 재직 처리 |

---

## 데이터베이스

- 스키마: `database/schema.sql`
- 파일: `database/holiday.db` (git 제외)
- Excel 임포트: `database/import_from_excel.py`  
  - 원본: `26' 사무직연차정리(260731)_커서작업용.xlsx`  
  - **Excel을 닫은 뒤** 임포트 (파일 잠금 주의)
  - 임포트 전 **서버 중지** (DB lock 방지)

---

## 트러블슈팅

| 증상 | 해결 |
|------|------|
| `포트 3001이 이미 사용 중` | `npm run restart` 실행 |
| `npm run prod` 후 바로 프롬프트로 돌아옴 | 포트 충돌 또는 창 종료 → `npm run restart` |
| PC에서는 되는데 모바일 안 됨 | IP 변경 가능 → `/health`의 `shareUrl` 확인, 같은 Wi-Fi인지 확인 |
| Excel 임포트 PermissionError | Excel 종료 후 재시도 |
| DB locked | 서버(`npm run restart`로 종료) 후 임포트 |

---

## 호스팅 배포 (카페24 AI Space / 개발 호스팅)

사내 연차 앱(직원 ~74명, Express + SQLite) 기준 리소스 추정입니다.  
**CPU 부하는 낮고**, 배포 방식(서버에서 빌드 vs 미리 빌드)에 따라 필요 RAM이 달라집니다.

### 현재 프로젝트 용량 (실측)

| 항목 | 크기 |
|------|------|
| 빌드 결과 (`dist/`) | ~0.4 MB |
| SQLite DB (`holiday.db`) | ~0.09 MB |
| `node_modules` (개발 포함) | ~143 MB |
| 운영 배포 시 (`devDependencies` 제외) | ~80–120 MB 예상 |

**런타임 부하**: Express 1프로세스 + 정적 파일 서빙 + SQLite → 동시 접속 10~20명도 여유 있는 수준.

### 카페24 AI Space (PaaS) — 권장

[AI Space 요금제](https://hosting.cafe24.com/?controller=new_product_page&page=ai-space) (2026년 기준):

| 단계 | RAM | 스토리지 | 동시접속 | 월 요금 |
|------|-----|----------|----------|---------|
| 1단계 | 256MB | 1GB | 50 | 4,900원 |
| 2단계 | 512MB | 2GB | 100 | 8,900원 |
| 3단계 | 1GB | 5GB | 200 | 14,900원 |
| 4단계 | 2GB | 10GB | 500 | 29,900원 |

| 상황 | 추천 |
|------|------|
| **일반적** (서버에서 `npm install` + `npm run build`) | **2단계 (512MB)** — 가장 무난 |
| 빌드 OOM 발생 시 | **3단계 (1GB)** |
| 로컬/CI에서 빌드 후 `dist`+서버만 업로드 | **1단계 (256MB)**도 런타임 가능 (여유는 적음) |
| 74명 사내용 | **1~2단계면 충분** (동시접속 50~100) |

- **스토리지**: 배포본 전체 ~200MB 미만 → **1GB면 충분** (로그·백업 여유 포함)
- **트래픽**: AI Space는 **무제한** (사내용 부담 없음)
- **Node.js / Express** 지원, **SQLite** 연동 가능 (영속 스토리지 설정 확인 필요)

### 카페24 Node.js VPS (개발 호스팅)

Express 자동 구성 VPS는 카페24가 **최소 DEV B · 4GB RAM**을 권장합니다.  
이 앱만 돌리기엔 **과한 스펙**이며, AI Space보다 비쌉니다.

| 비교 | AI Space 2단계 | Node.js VPS (DEV B) |
|------|----------------|---------------------|
| 적합도 | 사내 소규모 앱에 적합 | 여러 서비스·커스텀 필요 시 |
| RAM | 512MB (충분) | 4GB (이 앱엔 과함) |
| 비용 | ~8,900원/월 | ~33,000원~/월 |
| SQLite | 영속 스토리지 확인 필요 | root SSH로 직접 관리 |

### 런타임 메모리 감

```
Node.js + Express (idle)     ~80–120 MB
better-sqlite3               ~10–20 MB
동시 요청 처리 (소규모)       +수십 MB
─────────────────────────────────────
운영 중 합계                  ~150–250 MB  → 512MB면 여유
빌드 시 (Vite)                ~300–600 MB  → 256MB면 실패 가능
```

### 배포 시 주의사항

1. **`better-sqlite3`** — Linux 네이티브 모듈. 호스팅에서 `npm install` 시 빌드 도구 필요.
2. **SQLite 영속성** — PaaS 재배포 시 DB가 유지되는 **영속 볼륨** 설정 확인.
3. **인증 없음** — 현재 `CURRENT_EMPLOYEE_ID`로 고정 사용자. 외부 URL 공개 전 **로그인/접근 제한** 필요.
4. **구형 Node.js 호스팅** — Git push 방식, Node 버전·용량 제약 많음 → **AI Space 또는 Node VPS** 권장.

### 한 줄 요약

> **카페24 AI Space 2단계 (512MB / 2GB / 월 8,900원)**이 이 프로젝트에 가장 잘 맞습니다.  
> 빌드를 서버에서 하지 않고 미리 빌드해 올리면 **1단계(256MB)**도 가능하지만, 여유를 두려면 2단계가 안전합니다.

### AI Space 배포 (space_02)

상세: [`docs/AISPACE_DEPLOY.md`](docs/AISPACE_DEPLOY.md)

1. Cursor **Settings → MCP** → `cafe24-ai-space` **로그인/연결**
2. 채팅: `space_02에 Holiday 배포해줘`
3. 환경 변수: `CURRENT_EMPLOYEE_ID`, `AS_OF_DATE`, `DB_PATH`(영속 스토리지)

---

## 변경 이력

> **앞으로 기능·설정·DB를 바꿀 때마다 이 섹션에 날짜와 함께 한 줄 요약을 추가하세요.**

형식:

```markdown
### YYYY-MM-DD
- 변경 내용 (왜/무엇)
```

---

### 2026-09-04

- **회계 기준일 1/1** — `FISCAL_YEAR_START_MONTH = 0`, 근속 가산은 정규 연차 최초 발생일 기준
- **단일 포트 배포** — Express가 `dist/` 정적 파일 + `/api` 동시 서빙 (3001)
- **Stripe 스타일 UI** — Panel, PageHeader, Badge, 다크 사이드바 전면 개편
- **Excel 연차 대장 임포트** — 74명, `AS_OF_DATE=2026-08-31` 기준 스냅샷
- **관리자 기본** — `CURRENT_EMPLOYEE_ID=13` (박지은), `useAppStore` 기본 role `admin`
- **사원 명부** — `/admin/roster`, 입사·수정·퇴사·재직 API, `terminated_date` 컬럼
- **사번 칼럼** — 직원·연차 관리·명부 목록에 `empNo` 표시
- **모바일 반응형** — 하단 탭, 카드형 목록, 하단 시트 모달, safe-area
- **서버 실행 개선** — IP 자동 감지, `npm run restart`, `start-holiday.bat`, 포트 충돌 한글 안내
- **호스팅 배포 가이드** — 카페24 AI Space / Node.js VPS 리소스 추정 및 권장 플랜 (README)
- **AI Space 배포 준비** — `loadEnv.js`, `prestart` 빌드, `docs/AISPACE_DEPLOY.md`

---

## 프로젝트 구조

```
holiday/
├── src/                 # React 프론트
│   ├── pages/admin/     # 관리자 페이지
│   ├── pages/employee/  # 직원 페이지
│   ├── components/      # UI·Layout·Modal
│   ├── hooks/           # React Query hooks
│   └── utils/           # 연차 계산 로직
├── server/              # Express API
│   ├── routes/api.js
│   ├── services/        # leaveService, employeeService
│   └── .env             # 서버 설정
├── database/            # schema, import, holiday.db
├── scripts/restart-prod.ps1
└── start-holiday.bat    # Windows 원클릭 실행
```
