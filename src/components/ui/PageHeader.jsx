import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function PageHeader({ title, description, backTo, backLabel, actions, children }) {
  return (
    <div className="mb-6 sm:mb-8">
      {backTo && (
        <Link
          to={backTo}
          className="inline-flex items-center gap-1.5 text-sm text-stripe-muted hover:text-primary-600 mb-3 sm:mb-4 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {backLabel || '뒤로'}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-[22px] font-semibold text-stripe-text tracking-tight break-keep">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-stripe-muted mt-1 leading-relaxed">{description}</p>
          )}
          {children}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none [&>a]:flex-1 sm:[&>a]:flex-none">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
