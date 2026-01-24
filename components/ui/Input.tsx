import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
}

const Input: React.FC<InputProps> = ({
    label,
    error,
    className = '',
    id,
    ...props
}) => {
    return (
        <div className="flex flex-col gap-1.5 w-full">
            {label && (
                <label htmlFor={id} className="text-[10px] font-bold uppercase text-slate-500 tracking-widest pl-1">
                    {label}
                </label>
            )}
            <input
                id={id}
                className={`w-full rounded-md bg-background-dark border border-white/10 px-4 py-3 text-white text-sm outline-none transition-all placeholder:text-slate-600 focus:border-primary focus:ring-2 focus:ring-primary/20 ${error ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20' : ''} ${className}`}
                {...props}
            />
            {error && (
                <span className="text-[10px] text-red-500 font-bold tracking-tight pl-1">
                    {error}
                </span>
            )}
        </div>
    );
};

export default Input;
