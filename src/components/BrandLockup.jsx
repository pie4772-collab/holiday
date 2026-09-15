export function BrandMark({ className = 'h-8 w-8' }) {
  return (
    <img
      src="/kbi-mark.png"
      alt=""
      className={`shrink-0 object-contain ${className}`}
      aria-hidden="true"
    />
  );
}

export function BrandLockup({
  title = 'KBI 동양철관',
  subtitle = '연차관리',
  titleClassName = 'text-sm font-semibold text-white tracking-tight',
  subtitleClassName = 'text-[11px] text-stripe-sidebar-muted',
  markClassName = 'h-8 w-8',
  className = '',
}) {
  return (
    <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
      <BrandMark className={markClassName} />
      <div className="min-w-0">
        <p className={`truncate ${titleClassName}`}>{title}</p>
        {subtitle ? <p className={`truncate ${subtitleClassName}`}>{subtitle}</p> : null}
      </div>
    </div>
  );
}
