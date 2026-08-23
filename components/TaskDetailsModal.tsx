
import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Task } from '../types';

interface TaskDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    task: Task | null;
    onSuccess?: () => void;
}

const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({ isOpen, onClose, task, onSuccess }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);

    if (!isOpen || !task) return null;

    const expirationDate = task.expiration_date ? new Date(task.expiration_date) : null;
    const isExpired = expirationDate && expirationDate < new Date();

    const handleComplete = async () => {
        setLoading(true);
        try {
            const { error } = await supabase
                .from('tasks')
                .update({ status: 'DONE', completed: true })
                .eq('id', task.id);
            if (error) throw error;
            if (onSuccess) onSuccess();
            onClose();
        } catch (error: any) {
            alert('Erro ao concluir tarefa: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleConvertToProject = async () => {
        if (!confirm(`Deseja converter a tarefa "${task.title}" em um novo Projeto?`)) return;
        setLoading(true);
        try {
            // Pick a client: Try to find one from the project if linked, otherwise prompt
            let clientName = 'Indefinido (Via Tarefa)';
            
            const { error } = await supabase.from('projects').insert({
                name: task.title,
                status: 'ANALYSIS',
                client: clientName,
                type: 'business',
                value: 0,
                deadline: new Date().toISOString().split('T')[0],
                internal_observations: `Convertido da tarefa: ${task.description || ''}`,
                created_at: new Date().toISOString(),
                user_id: user?.id
            });
            if (error) throw error;
            
            // Optional: Mark task as completed or linked
            await supabase.from('tasks').update({ status: 'DONE', completed: true }).eq('id', task.id);
            
            alert('Projeto criado com sucesso! Status: Em Análise.');
            if (onSuccess) onSuccess();
            onClose();
        } catch (error: any) {
            alert('Erro ao converter: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
            <div className="bg-surface-dark border border-white/10 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                    <div className="flex flex-col">
                        <h2 className="text-xl font-black text-white leading-tight tracking-tight">{task.title}</h2>
                        <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-1">
                            {task.category} • {(task.status === 'DONE' || task.completed) ? 'CONCLUÍDO' : 'PENDENTE'}
                        </span>
                    </div>
                    <button onClick={onClose} className="size-10 flex items-center justify-center rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-all">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-8 overflow-y-auto space-y-8 custom-scrollbar-minimal">
                    <div className="flex flex-wrap gap-4 items-center">
                        <div className="flex flex-col gap-1 bg-white/5 p-4 rounded-xl border border-white/5 flex-1 min-w-[200px]">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Projeto Vinculado</span>
                            <span className="text-sm font-bold text-white">{(task as any).projects?.name || 'Projeto Avulso'}</span>
                        </div>
                        <div className={`flex flex-col gap-1 p-4 rounded-xl border flex-1 min-w-[200px] ${isExpired ? 'bg-red-500/10 border-red-500/20' : 'bg-primary/5 border-primary/20'}`}>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${isExpired ? 'text-red-400' : 'text-primary'}`}>
                                Vencimento / Renovação
                            </span>
                            <span className={`text-sm font-bold ${isExpired ? 'text-red-400' : 'text-white'}`}>
                                {expirationDate ? expirationDate.toLocaleDateString('pt-BR') : 'Sem data'}
                                {isExpired && <span className="ml-2 text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full uppercase font-black">Vencido</span>}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                            <span className="material-symbols-outlined text-[18px]">description</span>
                            Descrição / Detalhes
                        </h3>
                        <div className="bg-white/5 p-5 rounded-xl border border-white/5 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-medium">
                            {task.description || 'Sem descrição adicional.'}
                        </div>
                    </div>

                    {task.file_url && (
                        <div className="space-y-3">
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                <span className="material-symbols-outlined text-[18px]">attach_file</span>
                                Documentação Anexa
                            </h3>
                            <a
                                href={task.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-4 bg-primary/10 hover:bg-primary/20 p-5 rounded-2xl border border-primary/20 text-primary transition-all group shadow-lg shadow-primary/5"
                            >
                                <div className="size-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                    <span className="material-symbols-outlined text-[28px]">download</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-black uppercase tracking-wider">Ver Arquivo do Aditivo</span>
                                    <span className="text-[10px] uppercase opacity-75 font-black tracking-widest mt-0.5">Clique para abrir ou baixar</span>
                                </div>
                                <span className="material-symbols-outlined ml-auto group-hover:translate-x-1 transition-transform">arrow_forward</span>
                            </a>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-white/5 bg-white/[0.02] flex flex-wrap gap-4 items-center justify-between">
                    <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-xl border border-white/5">
                        <span className="material-symbols-outlined text-[18px] text-slate-500">person</span>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                            Dono: <span className="text-slate-200">{(task as any).user_profiles?.email?.split('@')[0] || 'N/A'}</span>
                        </span>
                    </div>
                    
                    <div className="flex gap-3">
                        {task.status !== 'DONE' && !task.completed && (
                            <>
                                <button
                                    onClick={handleConvertToProject}
                                    disabled={loading}
                                    className="px-5 py-3 bg-white/5 hover:bg-white/10 text-white text-[11px] font-black uppercase tracking-widest rounded-xl border border-white/10 transition-all flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                                    Virar Projeto
                                </button>
                                <button
                                    onClick={handleComplete}
                                    disabled={loading}
                                    className="px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                                    Concluir
                                </button>
                            </>
                        )}
                        <button
                            onClick={onClose}
                            className="px-6 py-3 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-[11px] font-black uppercase tracking-widest rounded-xl border border-white/10 transition-all"
                        >
                            Fechar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TaskDetailsModal;
