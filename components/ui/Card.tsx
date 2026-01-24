import React from 'react';

interface CardProps {
    title?: string;
    description?: string;
    children: React.ReactNode;
    className?: string;
    footer?: React.ReactNode;
}

const Card: React.FC<CardProps> = ({
    title,
    description,
    children,
    className = '',
    footer
}) => {
    return (
        <div className={`bg-surface-dark border border-white/5 rounded-2xl shadow-xl overflow-hidden group hover:border-white/10 transition-all ${className}`}>
            {(title || description) && (
                <div className="p-6 border-b border-white/5 bg-white/5">
                    {title && <h3 className="text-xl font-black text-white italic tracking-tight">{title}</h3>}
                    {description && <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">{description}</p>}
                </div>
            )}
            <div className="p-6">
                {children}
            </div>
            {footer && (
                <div className="px-6 py-4 bg-white/[0.02] border-t border-white/5">
                    {footer}
                </div>
            )}
        </div>
    );
};

export default Card;
