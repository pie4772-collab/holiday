const variants = {
  primary:
    'bg-primary-500 text-white hover:bg-primary-600 shadow-sm border border-primary-500 hover:border-primary-600',
  secondary:
    'bg-white text-stripe-text hover:bg-[#f6f9fc] border border-stripe-border shadow-sm',
  ghost: 'text-stripe-muted hover:text-stripe-text hover:bg-[#f0f3f7]',
  danger: 'bg-[#df1b41] text-white hover:bg-[#c91839] border border-[#df1b41]',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
