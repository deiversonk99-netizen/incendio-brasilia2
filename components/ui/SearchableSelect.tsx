import React, { useState, useRef, useEffect } from 'react';

interface Option {
    id: string;
    label: string;
    subLabel?: string;
}

interface SearchableSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    label?: string;
    required?: boolean;
    className?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = 'Selecionar...',
    label,
    required = false,
    className = ""
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    // Initial search term should match the current value's label if possible
    useEffect(() => {
        const selectedOption = options.find(opt => opt.label === value);
        if (selectedOption) {
            setSearchTerm(''); // Keep search term empty when not searching
        }
    }, [value, options]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (opt.subLabel && opt.subLabel.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const handleSelect = (option: Option) => {
        onChange(option.label);
        setSearchTerm('');
        setIsOpen(false);
    };

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            {label && (
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5 font-bold">
                    {label}
                </label>
            )}
            
            <div 
                className={`w-full rounded-lg bg-background-dark border transition-all cursor-pointer flex items-center justify-between px-4 py-3 ${
                    isOpen ? 'border-primary ring-1 ring-primary/20' : 'border-white/10'
                }`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={`text-sm ${value ? 'text-white' : 'text-slate-500'}`}>
                    {value || placeholder}
                </span>
                <span className={`material-symbols-outlined text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                    expand_more
                </span>
            </div>

            {isOpen && (
                <div className="absolute z-[110] w-full mt-2 bg-surface-dark border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-2 border-b border-white/5 bg-white/5">
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[18px]">search</span>
                            <input
                                type="text"
                                autoFocus
                                className="w-full bg-background-dark border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-primary outline-none"
                                placeholder="Pesquisar..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    </div>
                    
                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                        {filteredOptions.length === 0 ? (
                            <div className="px-4 py-8 text-center text-slate-500 italic text-xs">
                                Nenhum resultado encontrado
                            </div>
                        ) : (
                            filteredOptions.map((option) => (
                                <div
                                    key={option.id}
                                    className={`px-4 py-3 cursor-pointer hover:bg-primary/10 transition-colors border-b border-white/5 last:border-0 ${
                                        value === option.label ? 'bg-primary/20' : ''
                                    }`}
                                    onClick={() => handleSelect(option)}
                                >
                                    <div className="text-sm font-bold text-white mb-0.5">{option.label}</div>
                                    {option.subLabel && (
                                        <div className="text-[10px] text-primary font-bold uppercase tracking-tight opacity-70">
                                            {option.subLabel}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
            
            {required && !value && (
                <input 
                    tabIndex={-1}
                    autoComplete="off"
                    style={{ opacity: 0, height: 0, position: 'absolute' }}
                    required
                />
            )}
        </div>
    );
};

export default SearchableSelect;
