/** 결재란·합의란: 직위 / 이름 / 처리일(또는 반려·대리 표시) 세 줄 */
export function SignBlock({ title, signers }) {
  if (!signers.length) return null;
  return (
    <table className="border-collapse text-[13px]">
      <tbody>
        <tr>
          <th rowSpan={3} className="w-7 border border-black bg-[#f2f2f2] px-1 text-center font-semibold leading-tight">
            {title.split('').map((ch, i) => (
              <span key={i} className="block">
                {ch}
              </span>
            ))}
          </th>
          {signers.map((s) => (
            <td key={s.key} className="h-7 w-[78px] border border-black px-1 text-center font-normal">
              <span className="block truncate">{s.position}</span>
            </td>
          ))}
        </tr>
        <tr>
          {signers.map((s) => (
            <td key={s.key} className="h-[66px] border border-black px-1 text-center align-middle">
              <span className="block break-keep">{s.name}</span>
            </td>
          ))}
        </tr>
        <tr>
          {signers.map((s) => (
            <td
              key={s.key}
              className={`h-7 border border-black px-0.5 text-center text-[11px] tabular-nums ${s.alert ? 'font-semibold text-[#c0262d]' : ''}`}
            >
              {s.sub}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
