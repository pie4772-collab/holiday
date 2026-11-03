import { X } from 'lucide-react';

export function TrainingModal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-[#0a2540]/40" onClick={onClose} />
      <div
        className={`relative w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-2xl'} stripe-panel max-h-[92vh] overflow-y-auto rounded-t-xl shadow-xl sm:rounded-lg safe-bottom`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stripe-border bg-white px-5 py-4">
          <h2 className="text-base font-semibold text-stripe-text">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-[#f0f3f7]">
            <X className="h-4 w-4 text-stripe-muted" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
