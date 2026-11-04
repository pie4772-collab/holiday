import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { VERIFY_PATH, certNumberText } from '../../constants/certificates';

const cell = 'border border-black px-3 py-2';
const head = `${cell} w-28 bg-[#f2f2f2] text-center font-semibold`;

function koreanDate(key) {
  if (!key) return '';
  const [y, m, d] = key.split('-');
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}

/** 발급 당시 내용 사본(content)으로 증명서를 A4 한 장에 인쇄합니다. 화면에는 보이지 않습니다. */
export function CertificatePrintSheet({ cert }) {
  const c = cert.content;
  const personal = [
    ['성명', c.name],
    ...(c.birthDate ? [['생년월일', koreanDate(c.birthDate)]] : []),
    ...(c.address ? [['주소', c.address]] : []),
  ];
  const period = `${koreanDate(c.hireDate)} ~ ${c.endDate ? koreanDate(c.endDate) : '현재'}${
    c.serviceLength ? ` (${c.serviceLength})` : ''
  }`;
  const employment = [
    ['회사명', c.companyName],
    ...(c.department ? [['소속', c.department]] : []),
    ...(c.position ? [['직위', c.position]] : []),
    ['재직기간', period],
    ...(c.duty ? [['담당업무', c.duty]] : []),
    ...(c.retireReason ? [['퇴직사유', c.retireReason]] : []),
  ];
  const verifyUrl = `${window.location.origin}${VERIFY_PATH}`;

  const section = (title, rows) => (
    <table className="w-full border-collapse">
      <tbody>
        {rows.map(([label, value], index) => (
          <tr key={label}>
            {index === 0 && (
              <td rowSpan={rows.length} className={`${cell} w-12 bg-[#f2f2f2] text-center font-semibold [writing-mode:vertical-rl]`}>
                {title}
              </td>
            )}
            <td className={head}>{label}</td>
            <td className={cell}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return createPortal(
    <div className="certificate-print text-black">
      <div className="flex min-h-[268mm] flex-col p-0.5 text-[14px] leading-relaxed">
        <div className="text-[12px]">{certNumberText(cert.certNo)}</div>
        <h1 className="mb-12 mt-10 text-center text-[32px] font-bold tracking-[0.25em]">{c.heading}</h1>

        <div className="space-y-4">
          {section('인적사항', personal)}
          {section('재직사항', employment)}
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <td className={`${cell} w-12 bg-[#f2f2f2] text-center font-semibold`}>용도</td>
                <td className={cell}>
                  {c.purpose}
                  {c.submitTo ? ` (제출처: ${c.submitTo})` : ''}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-16 text-center text-[17px]">{c.statement}</p>
        <p className="mt-10 text-center text-[16px]">{koreanDate(c.issueDate)}</p>

        <div className="mt-12 text-center">
          {c.companyAddress && <div className="text-[13px]">{c.companyAddress}</div>}
          {c.companyPhone && <div className="text-[13px]">전화 {c.companyPhone}</div>}
          <div className="mt-3 text-[22px] font-bold tracking-wide">{c.companyName}</div>
          <div className="relative mt-2 inline-block text-[17px]">
            대표이사 {c.ceoName}
            <span className="ml-3">(인)</span>
            {cert.sealImage && (
              <img
                src={cert.sealImage}
                alt=""
                className="absolute -right-6 top-1/2 h-[24mm] w-[24mm] -translate-y-1/2 object-contain"
              />
            )}
          </div>
        </div>

        <div className="mt-auto border-t border-black pt-2 text-[10.5px] leading-snug">
          이 증명서는 {verifyUrl} 에서 발급번호 <strong>{cert.certNo}</strong>, 확인 코드 <strong>{cert.verifyCode}</strong>로 진위를
          확인할 수 있습니다. (발급 {String(cert.issuedAt || '').slice(0, 16)})
        </div>
      </div>
    </div>,
    document.body
  );
}

/** 증명서를 그린 뒤 인쇄 창을 열고, 닫히면 onDone 을 부릅니다. */
export function CertificatePrinter({ cert, onDone }) {
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let cancelled = false;
    const finish = () => done.current?.();
    window.addEventListener('afterprint', finish, { once: true });
    const images = [...document.querySelectorAll('.certificate-print img')];
    Promise.all(images.map((img) => img.decode?.().catch(() => {})))
      .then(() => new Promise((resolve) => requestAnimationFrame(resolve)))
      .then(() => {
        if (!cancelled) window.print();
      });
    return () => {
      cancelled = true;
      window.removeEventListener('afterprint', finish);
    };
  }, []);

  return <CertificatePrintSheet cert={cert} />;
}
