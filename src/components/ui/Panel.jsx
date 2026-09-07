export function Panel({ children, className = '' }) {
  return <div className={`stripe-panel overflow-hidden ${className}`}>{children}</div>;
}

export function PanelHeader({ title, description, actions }) {
  return (
    <div className="stripe-panel-header">
      <div>
        <h3 className="stripe-panel-title">{title}</h3>
        {description && <p className="stripe-panel-desc">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PanelBody({ children, className = '', noPadding = false }) {
  return (
    <div className={noPadding ? className : `p-5 ${className}`}>{children}</div>
  );
}
