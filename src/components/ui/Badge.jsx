const variants = {
  default: 'bg-[#f0f3f7] text-stripe-muted',
  primary: 'bg-primary-50 text-primary-700',
  success: 'bg-[#d7f7c2] text-[#09825d]',
  warning: 'bg-[#fef3c7] text-[#b45309]',
  danger: 'bg-[#fee2e2] text-[#df1b41]',
  info: 'bg-[#e0e7ff] text-[#4338ca]',
  purple: 'bg-[#ede9fe] text-[#6d28d9]',
  orange: 'bg-[#ffedd5] text-[#c2410c]',
};

export function Badge({ variant = 'default', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${variants[variant] || variants.default} ${className}`}
    >
      {children}
    </span>
  );
}
