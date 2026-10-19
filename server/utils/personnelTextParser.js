/**
 * 증명서류에서 읽은 글자(OCR)에서 인사기록카드 항목 후보를 뽑습니다.
 * 규칙 기반이라 틀릴 수 있으므로 화면에서 관리자가 확인·수정한 뒤에만 저장합니다.
 * 주민등록번호는 뒤 6자리를 가리고, 생년월일·성별 후보를 만드는 데만 씁니다.
 */

const MAX_FIELD = 200;

const RRN_RE = /(?<!\d)(\d{2})(\d{2})(\d{2})\s*[-–—]\s*([1-8])(\d{6})(?!\d)/g;
const RRN_ANY_RE = /(?<!\d)(\d{2})(\d{2})(\d{2})\s*[-–—]\s*([1-8])(?:\d{6}|[*xX●]{6})(?![\d*])/g;
const DATE_RE =
  /((?:19|20)\d{2})\s*(?:[./-]|년)\s*(\d{1,2})(?!\d)(?:\s*(?:(?:[./-]|월)\s*(\d{1,2})(?!\d)(?:\s*일(?=$|[^가-힣]|까지|부터))?|월(?=$|[^가-힣]|까지|부터)))?\.?/g;
const RANGE_SEP_RE = /^\s*(?:~|∼|〜|～|-|–|—|부터)?\s*$/;
const MOBILE_RE = /(?<!\d)(01[016789])\s*[-.)]?\s*(\d{3,4})\s*[-.]?\s*(\d{4})(?!\d)/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const PROVINCE_RE =
  /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청북|충청남|충북|충남|전라북|전라남|전북|전남|경상북|경상남|경북|경남|제주)\S*\s+\S+(시|군|구)\b/;

const SCHOOL_RE = /[가-힣A-Za-z0-9]+(대학원|대학교|전문대학|대학|고등학교|고교|중학교|초등학교)/;
const LICENSE_RE = /(기술사|기능장|산업기사|기사|기능사|면허|자격증|지도사|관리사|평가사|중개사|운전원|조종사|\d급)/;
const ISSUER_RE = /(공단|협회|위원회|진흥원|시험원|상공회의소|경찰청|센터|교육원|연구원|학회|재단|부|청|처)$/;
const COMPANY_RE = /(\(주\)|㈜|주식회사|\(유\)|유한회사|\(재\)|\(사\)|회사|공사|산업|정밀|강관|건설|전자|기업)/;
const TRAINING_ORG_RE = /(원|센터|협회|공단|학원|대학교|연수원|교육원)$/;

const SECTION_RULES = [
  { re: /학력/, section: 'education' },
  { re: /경력|근무\s*이력|직장/, section: 'career' },
  { re: /자격|면허/, section: 'license' },
  { re: /교육|연수|훈련/, section: 'training' },
  { re: /병역|군\s*경력/, section: 'military' },
  { re: /자기\s*소개|가족|성장|인적|신상|특기|취미|수상|외국어|어학/, section: null },
];

const GRADUATION = ['졸업예정', '졸업', '수료', '중퇴', '재학', '휴학', '편입'];

function clip(value) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  return s.length > MAX_FIELD ? s.slice(0, MAX_FIELD) : s;
}

function validDate(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function formatDate(y, m, d) {
  const year = Number(y);
  const month = m === undefined ? undefined : Number(m);
  const day = d === undefined ? undefined : Number(d);
  if (year < 1900 || year > 2100) return null;
  if (month === undefined) return String(year);
  if (month < 1 || month > 12) return null;
  if (day === undefined) return `${year}-${String(month).padStart(2, '0')}`;
  if (!validDate(year, month, day)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 줄에서 날짜와 나머지 글자를 나눕니다. */
function splitDates(line) {
  const dates = [];
  let rest = '';
  let last = 0;
  for (const m of line.matchAll(DATE_RE)) {
    const value = formatDate(m[1], m[2], m[3]);
    if (!value) continue;
    const between = line.slice(last, m.index);
    rest += dates.length && RANGE_SEP_RE.test(between) ? ' ' : `${between} `;
    dates.push(value);
    last = m.index + m[0].length;
  }
  rest += line.slice(last);
  rest = rest
    .replace(/[()[\]]\s*[~∼〜～–—-]?\s*[()[\]]/g, ' ')
    .replace(/(^|\s)[~∼〜～–—:-]+(?=\s|$)/g, ' ')
    .replace(/(^|\s)(까지|부터)(?=\s|$)/g, ' ')
    .replace(/\(\s*\)/g, ' ');
  return { dates, rest: clip(rest) };
}

function normalizeLine(line) {
  return line
    .replace(/[|｜]/g, ' ')
    .replace(/[：]/g, ':')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "[학력사항]", "■ 경력", "자격·면허" 같은 머리글이면 { section, rest } */
function detectSection(line) {
  const bracket = line.match(/^[[【<(■□●◆▶※\s]*([^\]】>)]{1,20})[\]】>)]\s*(.*)$/);
  const head = bracket ? bracket[1] : line.replace(/^[■□●◆▶※\-\s]+/, '');
  const rest = bracket ? bracket[2] : '';
  if (!bracket && (head.length > 14 || /\d/.test(head))) return null;
  const rule = SECTION_RULES.find((r) => r.re.test(head));
  if (!rule) return null;
  return { section: rule.section, rest };
}

function maskRrn(text) {
  return text.replace(RRN_RE, (_all, yy, mm, dd, g) => `${yy}${mm}${dd}-${g}******`);
}

function rrnCandidates(text) {
  const out = [];
  for (const m of text.matchAll(RRN_ANY_RE)) {
    const [, yy, mm, dd, g] = m;
    const century = ['1', '2', '5', '6'].includes(g) ? 1900 : 2000;
    const birthDate = formatDate(century + Number(yy), mm, dd);
    const gender = Number(g) % 2 ? '남' : '여';
    if (birthDate && birthDate.length === 10 && !out.some((c) => c.birthDate === birthDate && c.gender === gender)) {
      out.push({ birthDate, gender });
    }
  }
  return out;
}

function fullDate(line) {
  for (const m of line.matchAll(DATE_RE)) {
    const value = formatDate(m[1], m[2], m[3]);
    if (value && value.length === 10) return value;
  }
  return null;
}

function parseMilitary(line, profile) {
  const status = /면제/.test(line)
    ? '면제'
    : /미필/.test(line)
      ? '미필'
      : /복무\s*중/.test(line)
        ? '복무중'
        : /전역|제대|군필|소집\s*해제/.test(line)
          ? '군필'
          : null;
  if (status && !profile.militaryStatus) profile.militaryStatus = status;
  const branch = line.match(/육군|해군|공군|해병대|의무경찰|의경|전투경찰|사회복무요원|공익근무|카투사/);
  if (branch && !profile.militaryBranch) profile.militaryBranch = branch[0];
  const rank = line.match(/이병|일병|상병|병장|하사|중사|상사|원사|준위|소위|중위|대위|소령|중령|대령/);
  if (rank && !profile.militaryRank) profile.militaryRank = rank[0];
  const discharge = line.match(/만기\s*전역|의가사\s*전역|의병\s*전역|만기\s*제대|소집\s*해제/);
  if (discharge && !profile.militaryDischarge) profile.militaryDischarge = discharge[0].replace(/\s+/g, '');
  const { dates } = splitDates(line);
  if (dates.length >= 2) {
    if (dates[0].length === 10 && dates[1].length === 10) {
      profile.militaryStart ||= dates[0];
      profile.militaryEnd ||= dates[1];
    } else if (!profile.militaryNotes) {
      profile.militaryNotes = `복무 기간 ${dates[0]} ~ ${dates[1]}`;
    }
  }
}

function guessCategory(rest, section) {
  if (SCHOOL_RE.test(rest) && !/교육원|연수원/.test(rest)) return 'education';
  if (LICENSE_RE.test(rest) && section !== 'career') return 'license';
  if (section === 'education' || section === 'career' || section === 'license' || section === 'training') return section;
  if (COMPANY_RE.test(rest)) return 'career';
  return null;
}

function educationRecord(rest, dates) {
  const school = rest.match(SCHOOL_RE);
  const detail = GRADUATION.find((g) => rest.includes(g)) || '';
  const degree = rest.match(/전문학사|학사|석사|박사/)?.[0];
  let title = school ? rest.replace(school[0], ' ') : rest;
  title = title.replace(/졸업예정|졸업|수료|중퇴|재학|휴학|편입|전문학사|학사|석사|박사/g, ' ');
  const name = school?.[0] || '';
  const result =
    degree || (detail === '졸업' ? (/고등학교|고교/.test(name) ? '고졸' : /전문대/.test(name) ? '전문학사' : /대학교$/.test(name) ? '학사' : '') : '');
  return {
    category: 'education',
    organization: clip(name),
    title: clip(title),
    result,
    detail,
    startDate: dates.length >= 2 ? dates[0] : '',
    endDate: dates.length >= 2 ? dates[1] : dates[0] || '',
  };
}

function careerRecord(rest, dates) {
  const tokens = rest.split(' ').filter(Boolean);
  let orgCount = 1;
  if (/^(\(주\)|㈜|주식회사|\(유\)|유한회사|\(재\)|\(사\))$/.test(tokens[0] || '') && tokens.length > 1) orgCount = 2;
  else if (/(\(주\)|㈜|주식회사)$/.test(tokens[1] || '')) orgCount = 2;
  return {
    category: 'career',
    organization: clip(tokens.slice(0, orgCount).join(' ')),
    title: clip(tokens.slice(orgCount).join(' ')),
    startDate: dates[0] || '',
    endDate: dates[1] || '',
  };
}

function licenseRecord(rest, dates) {
  const tokens = rest.split(' ').filter(Boolean);
  const issuer = tokens.filter((t) => ISSUER_RE.test(t) && !LICENSE_RE.test(t));
  const title = tokens.filter((t) => !issuer.includes(t) && !/^(취득|합격|최종합격)$/.test(t));
  return {
    category: 'license',
    title: clip(title.join(' ')),
    organization: clip(issuer.join(' ')),
    startDate: dates[0] || '',
    endDate: dates[1] || '',
  };
}

function trainingRecord(rest, dates) {
  const tokens = rest.split(' ').filter(Boolean);
  const org = tokens.filter((t) => TRAINING_ORG_RE.test(t));
  return {
    category: 'training',
    title: clip(tokens.filter((t) => !org.includes(t)).join(' ')),
    organization: clip(org.join(' ')),
    startDate: dates[0] || '',
    endDate: dates[1] || '',
  };
}

const RECORD_BUILDERS = {
  education: educationRecord,
  career: careerRecord,
  license: licenseRecord,
  training: trainingRecord,
};

// ----- 증명서 양식("항목 값")에서 항목명 뒤의 값 읽기 -----

const KNOWN_LABELS = [
  '성명', '주민등록번호', '생년월일', '주소', '소속', '부서', '직위', '직급', '직책', '담당업무', '근무기간',
  '재직기간', '근무부서', '회사명', '상호', '업체명', '사업장명', '법인명', '대표자', '용도', '학교명', '학과',
  '전공', '학부', '입학', '졸업', '학위', '자격종목', '종목', '자격명', '등급', '합격연월일', '취득일',
  '발급일', '교부일', '발급기관', '시행기관', '자격번호', '관리번호', '발급번호', '사업자등록번호',
];

function labelPattern(label) {
  return [...label].map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
}

const KNOWN_LABEL_RE = new RegExp(`(?:^|\\s)(?:${KNOWN_LABELS.map(labelPattern).join('|')})(?:\\s*:|\\s)`, 'g');

/** labels 중 하나가 들어 있는 첫 줄에서 그 뒤 값을 돌려줍니다(다음 항목명 앞까지). */
function labeled(lines, labels, accept = Boolean) {
  const re = new RegExp(`(?:${labels.map(labelPattern).join('|')})(?:\\s*(?:연\\s*월\\s*일|일\\s*자|기\\s*간|일))?\\s*:?\\s*(.*)$`, 'g');
  for (const line of lines) {
    for (const m of line.matchAll(re)) {
      let value = m[1];
      KNOWN_LABEL_RE.lastIndex = 0;
      const next = KNOWN_LABEL_RE.exec(` ${value}`);
      if (next && next.index > 0) value = ` ${value}`.slice(0, next.index);
      value = value.trim();
      if (value && accept(value)) return value;
    }
  }
  return '';
}

const hasDate = (value) => splitDates(value).dates.length > 0;

function companyIn(lines) {
  const named = labeled(lines, ['회사명', '상호', '업체명', '사업장명', '법인명']);
  if (named) return clip(named.replace(/\s*대표.*$/, ''));
  for (const line of [...lines].reverse()) {
    const m = line.match(/(주식회사\s*[^\s,]+|[^\s,]+\s*주식회사|\(주\)\s*[^\s,]+|㈜\s*[^\s,]+|[^\s,]+\s*\(주\))/);
    if (m) return clip(m[1]);
  }
  return '';
}

function firstDate(value) {
  return splitDates(value).dates[0] || '';
}

function careerCertificate(lines) {
  const { dates } = splitDates(labeled(lines, ['근무', '재직'], hasDate));
  const organization = companyIn(lines);
  const title = [labeled(lines, ['근무부서', '소속', '부서']), labeled(lines, ['직위', '직급', '직책'])]
    .filter((v) => v && !splitDates(v).dates.length)
    .join(' ');
  const detail = labeled(lines, ['담당업무']);
  if (!organization && !dates.length) return [];
  return [{ category: 'career', organization, title: clip(title), detail: clip(detail), startDate: dates[0] || '', endDate: dates[1] || '' }];
}

function educationCertificate(lines, text) {
  const named = labeled(lines, ['학교명']);
  const school = (named.match(SCHOOL_RE) || text.match(SCHOOL_RE))?.[0] || named;
  const major = labeled(lines, ['학과', '전공', '학부']).replace(/(을|를)$/, '');
  const startDate = firstDate(labeled(lines, ['입학'], hasDate));
  const endDate = firstDate(labeled(lines, ['졸업'], hasDate));
  const degreeText = labeled(lines, ['학위']);
  const degree = (degreeText.match(/전문학사|학사|석사|박사/) || text.match(/전문학사|석사|박사/))?.[0];
  const detail = /졸업\s*예정/.test(text) ? '졸업예정' : endDate || /졸업하였/.test(text) ? '졸업' : '';
  const result =
    degree || (detail === '졸업' ? (/고등학교|고교/.test(school) ? '고졸' : /전문대/.test(school) ? '전문학사' : /대학교$/.test(school) ? '학사' : '') : '');
  if (!school && !major) return [];
  return [{ category: 'education', organization: clip(school), title: clip(major.split(' ')[0] || ''), result, detail, startDate, endDate }];
}

function licenseCertificate(lines) {
  const title = labeled(lines, ['자격종목', '자격명', '종목']);
  const startDate = firstDate(labeled(lines, ['합격', '취득', '발급', '교부'], hasDate));
  let organization = labeled(lines, ['발급기관', '시행기관']);
  if (!organization) {
    for (const line of lines) {
      const token = line.split(' ').find((t) => ISSUER_RE.test(t) && t.length > 2);
      if (token) {
        organization = token;
        break;
      }
    }
  }
  const detail = labeled(lines, ['자격번호', '관리번호']);
  if (!title) return [];
  return [{ category: 'license', title: clip(title), organization: clip(organization), detail: clip(detail), startDate, endDate: '' }];
}

const CERTIFICATE_PARSERS = {
  경력증명서: careerCertificate,
  최종학력증명서: educationCertificate,
  성적증명서: educationCertificate,
  '자격증 사본': licenseCertificate,
};

/** 줄마다 날짜를 보고 이력을 뽑지 않는 서류 */
const NO_LINE_RECORDS = ['자기소개서', '주민등록등본', '근로계약서', ...Object.keys(CERTIFICATE_PARSERS)];

/**
 * @param {string} rawText OCR 결과
 * @param {string} docType 증명서류 종류
 * @returns {{ text: string, profile: Record<string,string>, records: object[] }}
 *   text 는 주민등록번호를 가린 전체 글자입니다.
 */
export function parsePersonnelText(rawText, docType = '') {
  const source = String(rawText || '');
  const profile = {};
  const rrns = rrnCandidates(source);
  const text = maskRrn(source);
  const lines = text.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  const records = CERTIFICATE_PARSERS[docType]?.(lines, lines.join('\n')) || [];
  const lineRecords = !NO_LINE_RECORDS.includes(docType);
  let section = null;

  for (let line of lines) {
    const head = detectSection(line);
    if (head) {
      section = head.section;
      line = head.rest;
      if (!line) continue;
    }

    if (/생\s*년\s*월\s*일/.test(line) && !profile.birthDate) {
      const date = fullDate(line);
      if (date) profile.birthDate = date;
    }
    const mobile = line.match(MOBILE_RE);
    if (mobile) {
      const phone = `${mobile[1]}-${mobile[2]}-${mobile[3]}`;
      if (/비상|긴급|보호자/.test(line)) profile.emergencyPhone ||= phone;
      else profile.mobilePhone ||= phone;
    }
    const email = line.match(EMAIL_RE);
    if (email && !profile.personalEmail) profile.personalEmail = email[0];
    const labeledAddress = line.match(/주\s*소\s*:?\s*(.+)$/);
    if (labeledAddress && !profile.address) {
      profile.address = clip(labeledAddress[1].replace(/\s*(전화|연락처|휴대|이메일|E-?mail)\s*:.*$/i, ''));
    } else if (!profile.address && PROVINCE_RE.test(line) && !/\d{4}\s*[./-]/.test(line)) {
      profile.address = clip(line);
    }

    if (lineRecords && (section === 'military' || /병역|전역|제대|군필|면제|미필/.test(line))) {
      parseMilitary(line, profile);
      if (section === 'military') continue;
    }

    if (!lineRecords) continue;
    const { dates, rest } = splitDates(line);
    if (!dates.length || rest.length < 2 || /생년|주민|성명|이메일|휴대|전화|작성일|제출일/.test(line)) continue;
    if (/^(?:입학|졸업|합격|취득|발급|교부|근무|재직|기간|연월일|일자|\s)+$/.test(rest)) continue;
    const category = guessCategory(rest, section);
    if (!category) continue;
    const record = RECORD_BUILDERS[category](rest, dates);
    if (!record.title && !record.organization) continue;
    if (record.startDate && record.endDate && record.endDate < record.startDate) continue;
    records.push(record);
  }

  if (!profile.birthDate && rrns.length === 1) profile.birthDate = rrns[0].birthDate;
  if (rrns.length === 1 && rrns[0].birthDate === profile.birthDate) profile.gender = rrns[0].gender;

  return { text, profile, records };
}
