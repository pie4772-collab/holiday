/** 인사기록카드 항목 정의 (서버·화면 공용) */

export const GENDERS = ['남', '여'];
export const MILITARY_STATUSES = ['군필', '미필', '면제', '복무중', '해당없음'];

/** 기본정보·병역 (1인 1행). key → CSV 머리글 */
export const PROFILE_FIELDS = [
  { key: 'birthDate', label: '생년월일', type: 'date', section: 'basic' },
  { key: 'gender', label: '성별', options: GENDERS, section: 'basic' },
  { key: 'mobilePhone', label: '휴대전화', section: 'basic' },
  { key: 'personalEmail', label: '개인 이메일', section: 'basic' },
  { key: 'address', label: '주소', section: 'basic', wide: true },
  { key: 'emergencyName', label: '비상연락처 이름', section: 'basic' },
  { key: 'emergencyRelation', label: '비상연락처 관계', section: 'basic' },
  { key: 'emergencyPhone', label: '비상연락처 전화', section: 'basic' },
  { key: 'militaryStatus', label: '병역 구분', options: MILITARY_STATUSES, section: 'military' },
  { key: 'militaryBranch', label: '군별', section: 'military' },
  { key: 'militaryRank', label: '계급', section: 'military' },
  { key: 'militaryStart', label: '복무 시작', type: 'date', section: 'military' },
  { key: 'militaryEnd', label: '복무 종료', type: 'date', section: 'military' },
  { key: 'militaryDischarge', label: '전역 구분', section: 'military' },
  { key: 'militaryNotes', label: '병역 비고', section: 'military', wide: true },
];

/** 이력 공통 열. 구분마다 화면에 보이는 이름만 다릅니다. */
export const RECORD_FIELDS = ['startDate', 'endDate', 'title', 'organization', 'result', 'detail', 'notes'];

export const RECORD_CSV_LABELS = {
  startDate: '시작일',
  endDate: '종료일',
  title: '명칭',
  organization: '기관',
  result: '결과',
  detail: '내용',
  notes: '비고',
};

export const RECORD_CATEGORIES = [
  {
    key: 'education',
    label: '학력',
    aliases: ['학력'],
    fields: { organization: '학교', title: '전공', result: '학위', detail: '졸업 구분', startDate: '입학', endDate: '졸업' },
    suggestions: { result: ['고졸', '전문학사', '학사', '석사', '박사'], detail: ['졸업', '졸업예정', '수료', '중퇴', '재학'] },
  },
  {
    key: 'career',
    label: '경력',
    aliases: ['경력'],
    fields: { organization: '회사', title: '부서·직위', startDate: '입사', endDate: '퇴사', detail: '담당 업무' },
  },
  {
    key: 'license',
    label: '자격·면허',
    aliases: ['자격·면허', '자격면허', '자격', '면허', '자격증'],
    fields: { title: '자격명', organization: '발급기관', startDate: '취득일', endDate: '만료일', detail: '자격번호' },
  },
  {
    key: 'appointment',
    label: '발령',
    aliases: ['발령', '발령이력'],
    fields: { startDate: '발령일', title: '발령 구분', organization: '부서', result: '직급', detail: '내용' },
    suggestions: { title: ['입사', '승진', '전보', '겸직', '직급 변경', '휴직', '복직', '퇴사', '기타'] },
  },
  {
    key: 'training',
    label: '교육',
    aliases: ['교육', '교육이력'],
    fields: { title: '교육명', organization: '교육기관', startDate: '시작일', endDate: '종료일', result: '이수 시간', detail: '이수 여부' },
    suggestions: { detail: ['이수', '미이수'] },
  },
  {
    key: 'evaluation',
    label: '평가',
    aliases: ['평가', '평가결과', '평가 결과'],
    fields: { title: '평가 구분', startDate: '평가일', result: '등급·점수', organization: '평가자', detail: '평가 의견' },
  },
];

export const RECORD_CATEGORY_KEYS = RECORD_CATEGORIES.map((c) => c.key);

/** 직원 본인 화면에서는 평가 결과를 보여주지 않습니다. */
export const SELF_HIDDEN_CATEGORIES = ['evaluation'];

/** 입사 증명서류 종류. 관리자(인사기록카드 조회 권한)만 볼 수 있습니다. */
export const DOCUMENT_TYPES = [
  '이력서',
  '자기소개서',
  '주민등록등본',
  '가족관계증명서',
  '최종학력증명서',
  '성적증명서',
  '경력증명서',
  '자격증 사본',
  '건강진단서',
  '통장 사본',
  '신분증 사본',
  '근로계약서',
  '기타',
];

export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

/** 확장자 → 내려받을 때 쓰는 형식. 미리보기는 PDF·이미지만 합니다. */
export const DOCUMENT_EXTENSIONS = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  hwp: 'application/x-hwp',
  hwpx: 'application/haansofthwpx',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
};

export const DOCUMENT_PREVIEW_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'];
