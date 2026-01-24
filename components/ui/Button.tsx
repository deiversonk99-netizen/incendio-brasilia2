import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
}

const Button: React.FC<ButtonProps> = ({
    children,
    variant = 'primary',
    size = 'md',
    isLoading = false,
    className = '',
    disabled,
    ...props
}) => {
    const baseStyles = 'inline-flex items-center justify-center font-bold uppercase tracking-widest transition-all duration-200 focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed';

    const variants: Record<string, string> = {
        primary: 'bg-primary text-white hover:bg-primary-dark shadow-lg shadow-primary/20 focus:ring-primary/40',
        secondary: 'bg-surface-dark border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white focus:ring-white/20',
        danger: 'bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/20 focus:ring-red-500/40',
        ghost: 'bg-transparent text-slate-400 hover:bg-white/5 hover:text-white focus:ring-white/10 border border-transparent'
    };

    const sizes: Record<string, string> = {
        sm: 'px-3 py-1.5 text-[10px] rounded-sm',
        md: 'px-5 py-2.5 text-xs rounded-md',
        lg: 'px-8 py-4 text-sm rounded-lg'
    };

    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading ? (
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    <span className="opacity-80 text-[10px]">Processando...</span>
                </div>
            ) : children}
        </button>
    );
};

export default Button;
