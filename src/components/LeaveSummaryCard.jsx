import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export function LeaveSummaryCard({
  title,
  value,
  unit = '일',
  subtitle,
  trend,
  highlight,
}) {
  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;

  return (
    <div
      className={`stripe-panel p-5 ${
        highlight ? 'ring-1 ring-primary-500/30 border-primary-200' : ''
      }`}
    >
      <p className="stripe-metric-label">{title}</p>
      <div className="flex items-baseline gap-1 mt-2">
        <span className="stripe-metric-value">{value}</span>
        <span className="text-sm text-stripe-muted font-medium">{unit}</span>
      </div>
      {subtitle && (
        <p className="text-[13px] text-stripe-muted mt-2 leading-snug">{subtitle}</p>
      )}
      {trend !== undefined && (
        <div className="mt-3 flex items-center gap-1 text-xs text-stripe-muted">
          <TrendIcon
            className={`h-3.5 w-3.5 ${
              trend > 0 ? 'text-[#09825d]' : trend < 0 ? 'text-[#df1b41]' : ''
            }`}
          />
          <span>{trend > 0 ? '+' : ''}{trend}일 전월 대비</span>
        </div>
      )}
    </div>
  );
}
