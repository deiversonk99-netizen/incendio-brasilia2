import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Project } from '../types';

interface ProjectDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    project: Project | null;
    onUpdate: () => void; // Refresh dashboard
}

const ProjectDetailsModal: React.FC<ProjectDetailsModalProps> = ({ isOpen, onClose, project, onUpdate }) => {
    const [updating, setUpdating] = useState(false);

    if (!isOpen || !project) return null;

    const handleStatusChange = async (newStatus: 'ANALYSIS' | 'APPROVED' | 'EXECUTION' | 'DONE') => {
        setUpdating(true);
        try {
            // Update project status
            const { error: updateError } = await supabase
                .from('projects')
                .update({ status: newStatus })
                .eq('id', project.id);

            if (updateError) throw updateError;

            // If marked as DONE, create financial entry if it doesn't exist
            if (newStatus === 'DONE') {
                const { data: existingEntry } = await supabase
                    .from('financial_transactions')
                    .select('id')
                    .eq('project_id', project.id)
                    .eq('type', 'INCOME')
                    .limit(1)
                    .maybeSingle();

                if (!existingEntry) {
                    await supabase.from('financial_transactions').insert({
                        user_id: project.user_id, // Ensure we use the project's user_id or current user
                        description: `Venda de Projeto: ${project.name}`,
                        value: project.value,
                        type: 'INCOME',
                        status: 'PENDING',
                        category: 'Vendas',
                        entity: project.client,
                        project_id: project.id,
                        date: new Date().toISOString().split('T')[0]
                    });
                }
            }

            onUpdate();
            onClose();
        } catch (error: any) {
            console.error('Error updating status:', error);
            alert('Erro ao atualizar status: ' + error.message);
        } finally {
            setUpdating(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('Tem certeza que deseja excluir este projeto? Essa ação não pode ser desfeita e apagará todos os itens e propostas associados.')) return;

        setUpdating(true);
        const { error } = await supabase.from('projects').delete().eq('id', project.id);

        setUpdating(false);
        if (error) {
            console.error(error);
            alert('Erro ao excluir projeto.');
        } else {
            onUpdate();
            onClose();
        }
    };

    const statusColors = {
        ANALYSIS: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        APPROVED: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
        EXECUTION: 'bg-primary/10 text-primary border-primary/20',
        DONE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    };

    const statusLabels = {
        ANALYSIS: 'Em Análise',
        APPROVED: 'Aprovado',
        EXECUTION: 'Em Execução',
        DONE: 'Concluído'
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface-dark border border-white/10 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/5">
                    <div>
                        <h2 className="text-xl font-bold text-white">{project.name}</h2>
                        <p className="text-sm text-slate-400 mt-1">{project.client} • {project.address}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1">

                    {/* Status Bar */}
                    <div className="mb-8">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">Status Atual</label>
                        <div className="grid grid-cols-4 gap-2">
                            {(Object.keys(statusLabels) as Array<keyof typeof statusLabels>).map((statusKey) => (
                                <button
                                    key={statusKey}
                                    onClick={() => handleStatusChange(statusKey)}
                                    disabled={updating}
                                    className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${project.status === statusKey
                                        ? `${statusColors[statusKey]} ring-1 ring-inset ring-white/10`
                                        : 'bg-background-dark border-white/5 text-slate-500 hover:bg-white/5'
                                        } ${updating ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <span className="text-xs font-bold uppercase">{statusLabels[statusKey]}</span>
                                    {project.status === statusKey && <span className="material-symbols-outlined text-[16px] mt-1">check_circle</span>}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-background-dark p-4 rounded-lg border border-white/5">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Valor Global</label>
                            <div className="text-xl font-bold text-white">R$ {Number(project.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        </div>
                        <div className="bg-background-dark p-4 rounded-lg border border-white/5">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Prazo</label>
                            <div className="text-xl font-bold text-white">{project.deadline || 'Não definido'}</div>
                        </div>
                    </div>

                    {project.blueprint_url && (
                        <div className="mt-6">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">Arquivos do Projeto</label>
                            <a
                                href={project.blueprint_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-4 p-4 rounded-xl bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-all group"
                            >
                                <div className="h-12 w-12 rounded-lg bg-primary/20 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                    <span className="material-symbols-outlined text-2xl">description</span>
                                </div>
                                <div className="flex-1">
                                    <div className="font-bold text-white text-sm uppercase tracking-wide">Planta / Memoriais</div>
                                    <div className="text-xs text-primary font-medium mt-0.5">Clique para visualizar ou baixar</div>
                                </div>
                                <span className="material-symbols-outlined text-slate-500 group-hover:text-primary transition-colors">open_in_new</span>
                            </a>
                        </div>
                    )}

                </div>

                {/* Actions Footer */}
                <div className="p-6 border-t border-white/5 bg-background-dark/50 rounded-b-xl flex justify-between items-center">
                    <button
                        onClick={handleDelete}
                        disabled={updating}
                        className="text-red-400 hover:text-red-300 text-sm font-medium flex items-center gap-2 px-3 py-2 rounded hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                        Excluir Projeto
                    </button>

                    <div className="flex gap-3">
                        <button className="px-4 py-2 bg-surface-dark border border-white/10 text-white rounded-lg font-bold text-sm hover:bg-white/5 transition-colors">
                            Editar Dados
                        </button>
                        <button className="px-6 py-2 bg-primary text-white rounded-lg font-bold text-sm hover:bg-primary-dark shadow-lg shadow-primary/20 transition-all flex items-center gap-2">
                            <span className="material-symbols-outlined text-[18px]">engineering</span>
                            Ir para Engenharia
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default ProjectDetailsModal;
