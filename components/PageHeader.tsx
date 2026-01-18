import React from 'react';

export interface BreadcrumbItem {
  label: string;
  active?: boolean;
  onClick?: () => void;
}

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  className?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  breadcrumbs,
  actions,
  className = ''
}) => {
  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          {breadcrumbs.map((item, index) => (
            <React.Fragment key={index}>
              {index > 0 && (
                <span className="material-symbols-outlined text-slate-600 text-[14px]">
                  chevron_right
                </span>
              )}
              <span
                className={`${item.active
                    ? "text-primary font-semibold"
                    : "text-slate-400"
                  } ${item.onClick ? "cursor-pointer hover:text-white transition-colors" : ""}`}
                onClick={item.onClick}
              >
                {item.label}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-black text-white tracking-tight">{title}</h2>
          {subtitle && <p className="text-slate-400">{subtitle}</p>}
        </div>

        {actions && (
          <div className="flex items-center gap-3">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};

export default PageHeader;
