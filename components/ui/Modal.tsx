import React from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    description,
    children,
    footer,
    maxWidth = 'lg'
}) => {
    if (!isOpen) return null;

    const maxWidthClasses: Record<string, string> = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl'
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className={`w-full ${maxWidthClasses[maxWidth]} rounded-2xl bg-surface-dark border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in duration-300`}>
                <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/5">
                    <div className="flex flex-col gap-0.5">
                        <h2 className="text-xl font-black text-white italic tracking-tight uppercase">
                            {title}
                        </h2>
                        {description && (
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                {description}
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    {children}
                </div>

                {footer && (
                    <div className="px-8 py-6 bg-white/[0.02] border-t border-white/5">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Modal;
