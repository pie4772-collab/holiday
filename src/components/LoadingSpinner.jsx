export function LoadingSpinner({ size = 'md', className = '' }) {
  const sizeClass = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
  }[size];

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div
        className={`${sizeClass} animate-spin rounded-full border-2 border-[#e3e8ee] border-t-primary-500`}
        role="status"
        aria-label="로딩 중"
      />
    </div>
  );
}
