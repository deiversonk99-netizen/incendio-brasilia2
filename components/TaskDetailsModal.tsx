
import React from 'react';
import { Task } from '../types';

interface TaskDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    task: Task | null;
}

const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({ isOpen, onClose, task }) => {
    if (!isOpen || !task) return null;

    const expirationDate = task.expiration_date ? new Date(task.expiration_date) : null;
    const isExpired = expirationDate && expirationDate < new Date();

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <div className="bg-surface-dark border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/2">
                    <div className="flex flex-col">
                        <h2 className="text-xl font-bold text-white leading-tight">{task.title}</h2>
                        <span className="text-[10px] font-black text-primary uppercase tracking-widest mt-1">
                            {task.category}
                        </span>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-all">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-8 overflow-y-auto space-y-8 custom-scrollbar">
                    {/* Project & Status Section */}
                    <div className="flex flex-wrap gap-4 items-center">
                        <div className="flex flex-col gap-1 bg-black/20 p-3 rounded-xl border border-white/5 flex-1 min-w-[200px]">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Projeto Vinculado</span>
                            <span className="text-sm font-bold text-white">{(task as any).projects?.name || 'Projeto Avulso'}</span>
                        </div>
                        <div className={`flex flex-col gap-1 p-3 rounded-xl border flex-1 min-w-[200px] ${isExpired ? 'bg-red-500/10 border-red-500/20' : 'bg-primary/5 border-primary/20'}`}>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${isExpired ? 'text-red-400' : 'text-primary'}`}>
                                Vencimento / Renovação
                            </span>
                            <span className={`text-sm font-bold ${isExpired ? 'text-red-400' : 'text-white'}`}>
                                {expirationDate ? expirationDate.toLocaleDateString('pt-BR') : 'Sem data'}
                                {isExpired && <span className="ml-2 text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full uppercase">Vencido</span>}
                            </span>
                        </div>
                    </div>

                    {/* Description Section */}
                    <div className="space-y-3">
                        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <span className="material-symbols-outlined text-[18px]">description</span>
                            Descrição / Detalhes
                        </h3>
                        <div className="bg-black/20 p-4 rounded-xl border border-white/5 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                            {task.description || 'Sem descrição adicional.'}
                        </div>
                    </div>

                    {/* Attachments Section */}
                    {task.file_url && (
                        <div className="space-y-3">
                            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <span className="material-symbols-outlined text-[18px]">attach_file</span>
                                Anexo / Aditivo
                            </h3>
                            <a
                                href={task.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-3 bg-primary/10 hover:bg-primary/20 p-4 rounded-xl border border-primary/20 text-primary transition-all group"
                            >
                                <span className="material-symbols-outlined text-[24px]">download</span>
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold">Ver Arquivo do Aditivo</span>
                                    <span className="text-[10px] uppercase opacity-75 font-black">Clique para abrir ou baixar</span>
                                </div>
                                <span className="material-symbols-outlined ml-auto group-hover:translate-x-1 transition-transform">arrow_forward</span>
                            </a>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-white/5 bg-black/10 flex justify-between items-center">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/5">
                        <span className="material-symbols-outlined text-[14px] text-slate-500">person</span>
                        <span className="text-[10px] font-medium text-slate-400">
                            Criado por: <span className="text-slate-200">{(task as any).user_profiles?.email || 'N/A'}</span>
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="px-8 py-3 bg-white/5 hover:bg-white/10 text-white text-sm font-bold rounded-xl border border-white/10 transition-all shadow-lg"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TaskDetailsModal;
