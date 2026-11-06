import { forwardRef } from 'react';
import {
  CONTRACT_CLOSING_CLAUSES,
  CONTRACT_LEAVE_CLAUSE,
  ETHICS_TEXT,
  INSURANCES,
  PLEDGE_TEXT,
  wageTotals,
} from '../../constants/onboarding';

/** A4 한 장(96dpi 기준 210×297mm). PDF로 만들 때 이 크기 그대로 찍습니다. */
export const SHEET_WIDTH = 794;
export const SHEET_HEIGHT = 1123;

const page = {
  width: SHEET_WIDTH,
  minHeight: SHEET_HEIGHT,
  padding: '64px 68px',
  background: '#ffffff',
  color: '#111111',
  fontFamily: '"Batang", "바탕", "Noto Serif KR", "AppleMyungjo", serif',
  fontSize: 14,
  lineHeight: 1.75,
  wordBreak: 'keep-all',
  boxSizing: 'border-box',
};

function koreanDate(key, spaced = true) {
  if (!key) return spaced ? '          년        월        일' : '';
  const [y, m, d] = key.split('-');
  return spaced ? `${y} 년  ${Number(m)} 월  ${Number(d)} 일` : `${y}년 ${Number(m)}월 ${Number(d)}일`;
}

function hhmm(value) {
  const [h, m] = String(value || '').split(':');
  return h ? `${h}시 ${m}분` : '';
}

function won(n) {
  return n ? Number(n).toLocaleString('ko-KR') : '-';
}

function shortDate(key) {
  if (!key) return '';
  const [y, m, d] = key.split('-');
  return `${y.slice(2)}.${m}.${d}`;
}

function Title({ children }) {
  return (
    <h1 style={{ textAlign: 'center', fontSize: 30, fontWeight: 700, letterSpacing: '0.35em', margin: '0 0 36px' }}>
      {children}
    </h1>
  );
}

/** "(서명)" 자리에 서명 이미지를 겹쳐 찍습니다. */
function SignMark({ image, label = '(서명)' }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', marginLeft: 18, minWidth: 64 }}>
      <span style={{ color: image ? '#999' : '#111' }}>{label}</span>
      {image && (
        <img
          src={image}
          alt=""
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            height: 56,
            width: 120,
            maxWidth: 'none',
            objectFit: 'contain',
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}
    </span>
  );
}

function SealMark({ image }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', marginLeft: 18, minWidth: 48 }}>
      (인)
      {image && (
        <img
          src={image}
          alt=""
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            height: 80,
            width: 80,
            maxWidth: 'none',
            objectFit: 'contain',
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}
    </span>
  );
}

function Row({ label, children, labelWidth = 84 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', minHeight: 32 }}>
      <span style={{ width: labelWidth, flexShrink: 0, textAlignLast: 'justify', marginRight: 12 }}>{label}</span>
      <span style={{ marginRight: 6 }}>:</span>
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  );
}

function Clause({ no, title, sep = ':', children }) {
  return (
    <div style={{ display: 'flex', marginBottom: 6 }}>
      <span style={{ width: 28, flexShrink: 0 }}>{no}.</span>
      <div style={{ flex: 1 }}>
        <strong>{title}</strong> {sep} {children}
      </div>
    </div>
  );
}

function ContractSheet({ data, company, employee, input, signature, seal }) {
  const period = `${koreanDate(data.startDate, false)}부터${data.endDate ? ` ${koreanDate(data.endDate, false)}까지` : ''}`;
  const terms = String(data.wageTerms || '').split('\n').filter(Boolean);
  return (
    <>
      <Title>근 로 계 약 서</Title>
      <p style={{ marginBottom: 18 }}>
        {company.companyName} (이하 "사업주"라 함)과(와) <strong>{employee.name}</strong> (이하 "근로자"라 함)은 다음과 같이
        근로계약을 체결한다.
      </p>
      <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>
        <Clause no={1} title="근로계약기간">{period}</Clause>
        <Clause no={2} title="근무장소">
          {data.workplace}
          <div style={{ fontSize: 12.5 }}>(업무상 필요한 경우 별도의 동의 없이 업무변경 및 타 사업장으로 전근시킬 수 있다)</div>
        </Clause>
        <Clause no={3} title="업무의 내용">{data.duty}</Clause>
        <Clause no={4} title="소정근로시간">
          {hhmm(data.workStart)}부터 {hhmm(data.workEnd)}까지(휴게시간 : {hhmm(data.breakStart)} ~ {hhmm(data.breakEnd)})
        </Clause>
        <Clause no={5} title="근무일/휴일">{data.workDays}</Clause>
        <Clause no={6} title="임금">
          별도의 임금결정통지서에 따름.
          {terms.map((line) => (
            <div key={line} style={{ paddingLeft: 12, fontSize: 12.5 }}>
              - {line}
            </div>
          ))}
        </Clause>
        <Clause no={7} title="수습기간">{data.probation || '해당 없음'}</Clause>
        <Clause no={8} title={CONTRACT_LEAVE_CLAUSE[0]} sep="-">{CONTRACT_LEAVE_CLAUSE[1]}</Clause>
        <Clause no={9} title="사회보험 적용여부" sep="">
          (해당란에 체크){' '}
          {INSURANCES.map((i) => (
            <span key={i.key} style={{ marginRight: 10 }}>
              {data.insurance?.[i.key] ? '■' : '□'}
              {i.label}
            </span>
          ))}
        </Clause>
        {CONTRACT_CLOSING_CLAUSES.map(([title, body], index) => (
          <Clause key={title} no={10 + index} title={title} sep="-">{body}</Clause>
        ))}
      </div>

      <p style={{ textAlign: 'center', margin: '22px 0 18px', fontSize: 15 }}>{koreanDate(data.contractDate)}</p>

      <div style={{ display: 'flex', gap: 12, fontSize: 13.5 }}>
        <span style={{ width: 64, flexShrink: 0 }}>(사업주)</span>
        <div style={{ flex: 1 }}>
          <Row label="사업체명">
            {company.companyName}
            {company.phone && <span style={{ marginLeft: 24 }}>(전화) {company.phone}</span>}
          </Row>
          <Row label="주소">{company.address}</Row>
          <Row label="대표자">
            {company.ceoName}
            {seal ? <SealMark image={company.sealImage} /> : <SignMark />}
          </Row>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 13.5, marginTop: 14 }}>
        <span style={{ width: 64, flexShrink: 0 }}>(근로자)</span>
        <div style={{ flex: 1 }}>
          <Row label="주소">{input.address}</Row>
          <Row label="연락처">{input.phone}</Row>
          <Row label="성명">
            {employee.name}
            <SignMark image={signature} />
          </Row>
        </div>
      </div>
    </>
  );
}

const th = { border: '1px solid #111', padding: '6px 4px', background: '#f2f2f2', fontWeight: 600, textAlign: 'center' };
const td = { border: '1px solid #111', padding: '8px 4px', textAlign: 'center', whiteSpace: 'nowrap' };

function WageSheet({ data, company, employee, signature, signedDate, seal }) {
  const totals = wageTotals(data);
  const [y, m, d] = String(data.noticeDate || '').split('-');
  const yy = y ? y.slice(2) : '';
  return (
    <>
      <Title>{yy ? `${yy}' ` : ''}임 금 결 정 통 지 서</Title>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
        <div>
          <div>- {data.category || '신규입사'}</div>
          <div>- 적용기간 : {data.period}</div>
        </div>
        <div>{y ? `${yy}' ${Number(m)}/${Number(d)}` : ''}</div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, lineHeight: 1.4 }}>
        <thead>
          <tr>
            <th style={th} rowSpan={2}>사업장</th>
            <th style={th} rowSpan={2}>직급</th>
            <th style={th} rowSpan={2}>부서</th>
            <th style={th} rowSpan={2}>성명</th>
            <th style={th} rowSpan={2}>입사일</th>
            <th style={th} colSpan={4}>급여</th>
            <th style={th} colSpan={2}>상여</th>
            <th style={th}>연봉</th>
          </tr>
          <tr>
            <th style={th}>기본급</th>
            <th style={th}>제수당</th>
            <th style={th}>월급여</th>
            <th style={th}>급여계(년) ①</th>
            <th style={th}>월상여</th>
            <th style={th}>상여계(년) ②</th>
            <th style={th}>①+②</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}>{data.workplace}</td>
            <td style={td}>{data.rank}</td>
            <td style={td}>{data.department}</td>
            <td style={td}>{employee.name}</td>
            <td style={td}>{shortDate(data.hireDate || employee.hireDate)}</td>
            <td style={td}>{won(data.basePay)}</td>
            <td style={td}>{won(data.allowance)}</td>
            <td style={td}>{won(totals.monthly)}</td>
            <td style={td}>{won(totals.salaryYear)}</td>
            <td style={td}>{won(data.monthlyBonus)}</td>
            <td style={td}>{won(totals.bonusYear)}</td>
            <td style={{ ...td, fontWeight: 700 }}>{won(totals.annual)}</td>
          </tr>
        </tbody>
      </table>
      <div style={{ fontSize: 12, marginTop: 8, color: '#333' }}>
        ※ 월급여 = 기본급 + 제수당, 급여계 = 월급여 × 12, 상여계 = 월상여 × 12, 연봉 = 급여계 + 상여계 (단위: 원)
      </div>

      <p style={{ marginTop: 40 }}>귀하의 임금을 위와 같이 결정하였음을 통지합니다.</p>
      <div style={{ textAlign: 'right', marginTop: 28, fontSize: 15 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{company.companyName}</div>
        <div style={{ marginTop: 6 }}>
          대표이사 {company.ceoName}
          {seal ? <SealMark image={company.sealImage} /> : <SignMark />}
        </div>
      </div>

      <div style={{ marginTop: 90, borderTop: '1px solid #111', paddingTop: 22 }}>
        <p>위 임금 결정 내용을 확인하였습니다.</p>
        <p style={{ textAlign: 'center', margin: '18px 0' }}>{koreanDate(signedDate)}</p>
        <div style={{ textAlign: 'right' }}>
          성 명 : {employee.name}
          <SignMark image={signature} />
        </div>
      </div>
    </>
  );
}

function PledgeBody({ text }) {
  return (
    <>
      <p style={{ marginBottom: 24 }}>{text.intro}</p>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {text.items.map((item, index) => (
          <li key={item} style={{ display: 'flex', marginBottom: 14 }}>
            <span style={{ width: 28, flexShrink: 0 }}>{index + 1}.</span>
            <span style={{ flex: 1 }}>{item}</span>
          </li>
        ))}
      </ol>
      <p style={{ marginTop: 28 }}>{text.closing}</p>
    </>
  );
}

function PledgeSheet({ company, employee, input, signature, signedDate }) {
  return (
    <>
      <Title>서 약 서</Title>
      <div style={{ fontSize: 15, lineHeight: 1.9 }}>
        <PledgeBody text={PLEDGE_TEXT} />
        <p style={{ textAlign: 'center', margin: '70px 0 50px' }}>{koreanDate(signedDate)}</p>
        <div style={{ marginLeft: '42%' }}>
          <Row label="현주소" labelWidth={64}>{input.address}</Row>
          <Row label="성명" labelWidth={64}>
            {employee.name}
            <SignMark image={signature} label="(인)" />
          </Row>
        </div>
        <p style={{ marginTop: 70, fontSize: 20, fontWeight: 700, letterSpacing: '0.08em' }}>{company.companyName} 귀중</p>
      </div>
    </>
  );
}

function EthicsSheet({ data, company, employee, signature, signedDate }) {
  return (
    <>
      <Title>윤 리 서 약 서</Title>
      <div style={{ fontSize: 15, lineHeight: 1.9 }}>
        <PledgeBody text={ETHICS_TEXT} />
        <p style={{ textAlign: 'center', margin: '70px 0 50px' }}>{koreanDate(signedDate)}</p>
        <div style={{ display: 'flex', gap: 10, marginLeft: '30%' }}>
          <span style={{ flexShrink: 0, lineHeight: '32px' }}>(서약인)</span>
          <div style={{ flex: 1 }}>
            <Row label="소속" labelWidth={52}>{data.department}</Row>
            <Row label="직위" labelWidth={52}>{data.rank}</Row>
            <Row label="성명" labelWidth={52}>
              {employee.name}
              <SignMark image={signature} />
            </Row>
          </div>
        </div>
        <p style={{ marginTop: 70, fontSize: 20, fontWeight: 700, letterSpacing: '0.08em' }}>{company.companyName} 귀중</p>
      </div>
    </>
  );
}

const SHEETS = { contract: ContractSheet, wage: WageSheet, pledge: PledgeSheet, ethics: EthicsSheet };

/**
 * 입사 서류 한 장. 인사담당 미리보기와 입사자 작성 화면, PDF 저장이 같은 모양을 씁니다.
 * input: 입사자가 적은 주소·연락처, signature: 서명 이미지(data URL), signedDate: 서명일(YYYY-MM-DD)
 * seal: 회사 직인을 찍을지(근로계약서·임금결정통지서)
 */
export const OnboardingSheet = forwardRef(function OnboardingSheet(
  { kind, data = {}, company, employee, input = {}, signature = '', signedDate = '', seal = false },
  ref
) {
  const Sheet = SHEETS[kind];
  if (!Sheet) return null;
  return (
    <div ref={ref} style={page}>
      <Sheet
        data={data}
        company={company}
        employee={employee}
        input={input}
        signature={signature}
        signedDate={signedDate}
        seal={seal}
      />
    </div>
  );
});
