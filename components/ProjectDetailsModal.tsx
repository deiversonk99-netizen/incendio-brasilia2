import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Project, AppView } from '../types';
import { getClientDisplayName } from '../lib/formatters';


interface ProjectDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    project: Project | null;
    onUpdate: () => void;
    onViewChange: (view: AppView) => void;
    onSelectProject: (id: string) => void;
    onEdit?: (project: Project) => void;
    hasProposal?: boolean;
    statusColumns?: any[];
}

const ProjectDetailsModal: React.FC<ProjectDetailsModalProps> = ({
    isOpen,
    onClose,
    project,
    onUpdate,
    onViewChange,
    onSelectProject,
    onEdit,
    hasProposal,
    statusColumns = []
}) => {
    const [updating, setUpdating] = useState(false);
    const [projectServices, setProjectServices] = useState<any[]>([]);
    const [showEditChoice, setShowEditChoice] = useState(false);
    const [showDeleteChoice, setShowDeleteChoice] = useState(false);
    const [clientDetails, setClientDetails] = useState<any>(null);


    useEffect(() => {
        if (isOpen && project) {
            fetchProjectServices();
            fetchClientDetails();
        }
    }, [isOpen, project]);

    const fetchProjectServices = async () => {
        if (!project) return;
        const { data } = await supabase
            .from('project_services')
            .select(`
                service_id,
                services_catalog (
                    name
                )
            `)
            .eq('project_id', project.id);

        if (data) {
            setProjectServices(data.map((ps: any) => ps.services_catalog?.name).filter(Boolean));
        }
    };

    const fetchClientDetails = async () => {
        if (!project || !project.client) return;
        const { data } = await supabase
            .from('clients')
            .select('id, name, fantasy_name')
            .eq('name', project.client)
            .maybeSingle();
        if (data) setClientDetails(data);
    };

    if (!isOpen || !project) return null;

    const handleStatusChange = async (newStatus: string) => {
        setUpdating(true);
        try {
            const { error: updateError } = await supabase
                .from('projects')
                .update({ status: newStatus })
                .eq('id', project.id);

            if (updateError) throw updateError;

            // Find the selected column to check its label
            const selectedCol = statusColumns.find(c => c.id === newStatus);
            
            if (selectedCol && selectedCol.label === 'Concluído') {
                const { data: existingEntry } = await supabase
                    .from('financial_transactions')
                    .select('id')
                    .eq('project_id', project.id)
                    .eq('type', 'INCOME')
                    .maybeSingle();

                if (!existingEntry) {
                    await supabase.from('financial_transactions').insert({
                        user_id: project.user_id,
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

    const handleDeletePhase = async (phase: 'A' | 'B' | 'C' | 'ALL') => {
        let message = '';
        switch (phase) {
            case 'A': message = 'Tem certeza que deseja limpar o Levantamento (Fase A)? Isso apagará todos os pavimentos.'; break;
            case 'B': message = 'Tem certeza que deseja limpar a Composição (Fase B)? Isso apagará todos os itens calculados.'; break;
            case 'C': message = 'Tem certeza que deseja limpar a Proposta (Fase C)? Isso apagará a proposta e itens manuais.'; break;
            case 'ALL': message = 'Tem certeza que deseja excluir ESTE PROJETO INTEIRO? Essa ação não pode ser desfeita.'; break;
        }

        if (!confirm(message)) return;

        setUpdating(true);
        try {
            if (phase === 'A' || phase === 'ALL') {
                await supabase.from('floors').delete().eq('project_id', project.id);
            }
            if (phase === 'B' || phase === 'ALL') {
                await supabase.from('budget_items').delete().eq('project_id', project.id).eq('origin', 'CALCULATED');
            }
            if (phase === 'C' || phase === 'ALL') {
                await supabase.from('proposals').delete().eq('project_id', project.id);
                await supabase.from('proposal_sections').delete().eq('project_id', project.id);
                await supabase.from('pdf_settings').delete().eq('project_id', project.id);
                await supabase.from('budget_items').delete().eq('project_id', project.id).eq('origin', 'MANUAL');
            }

            if (phase === 'ALL') {
                // Delete ALL budget items regardless of origin to ensure nothing is left
                const { error: budgetError } = await supabase.from('budget_items').delete().eq('project_id', project.id);
                if (budgetError) {
                    console.error('Error deleting budget items:', budgetError);
                }

                // Delete remaining dependencies not covered by phases
                await supabase.from('project_services').delete().eq('project_id', project.id);
                await supabase.from('tasks').delete().eq('project_id', project.id);
                await supabase.from('financial_transactions').delete().eq('project_id', project.id);
                await supabase.from('contract_renewals').delete().eq('project_id', project.id);

                // Finally delete the project itself with count verification
                const { error, count } = await supabase
                    .from('projects')
                    .delete({ count: 'exact' })
                    .eq('id', project.id);

                if (error) {
                    console.error('Error deleting project:', error);
                    throw error;
                }

                // Verify deletion succeeded
                if (count === 0) {
                    throw new Error('O projeto não pôde ser excluído ou já foi removido.');
                }
            }

            onUpdate();
            onClose();
        } catch (error: any) {
            console.error('Error during deletion:', error);
            alert('Erro ao processar exclusão: ' + error.message);
        } finally {
            setUpdating(false);
        }
    };

    const handleDelete = () => {
        if (!showDeleteChoice) {
            setShowDeleteChoice(true);
        } else {
            setShowDeleteChoice(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface-dark border border-white/10 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/5">
                    <div>
                        <h2 className="text-xl font-bold text-white">{project.name}</h2>
                        <p className="text-sm text-slate-400 mt-1">
                            {getClientDisplayName(clientDetails || { name: project.client }, 'ui')}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">

                    <div className="mb-8">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">Status do Projeto</label>
                        <div className="flex flex-wrap gap-2">
                            {statusColumns.map((col) => (
                                <button
                                    key={col.id}
                                    onClick={() => handleStatusChange(col.id)}
                                    disabled={updating}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all ${project.status === col.id
                                        ? `${col.color} text-white border-transparent shadow-lg scale-105`
                                        : 'bg-background-dark border-white/5 text-slate-500 hover:border-white/20 hover:text-white'
                                        }`}
                                >
                                    <span className="text-[10px] uppercase font-black tracking-tight">{col.label}</span>
                                    {project.status === col.id && <span className="material-symbols-outlined text-[16px] mt-0.5">check_circle</span>}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-8 mb-8">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">Serviços Contratados</label>
                        <div className="flex flex-wrap gap-2">
                            {projectServices.length > 0 ? (
                                projectServices.map((serviceName, idx) => (
                                    <span key={idx} className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[16px]">task_alt</span>
                                        {serviceName}
                                    </span>
                                ))
                            ) : (
                                <p className="text-slate-500 text-sm italic">Nenhum serviço vinculado a este projeto.</p>
                            )}
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

                    {project.internal_observations && (
                        <div className="mt-8 bg-amber-500/5 border border-amber-500/20 p-4 rounded-xl">
                            <label className="text-xs font-bold text-amber-500 uppercase tracking-wider mb-2 block flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px]">info</span>
                                Observações Internas (Não saem no PDF)
                            </label>
                            <p className="text-sm text-slate-300 italic leading-relaxed">
                                "{project.internal_observations}"
                            </p>
                        </div>
                    )}

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
                    <div className="relative">
                        <button
                            onClick={handleDelete}
                            disabled={updating}
                            className={`text-sm font-medium flex items-center gap-2 px-3 py-2 rounded transition-all disabled:opacity-50 ${showDeleteChoice ? 'bg-red-500 text-white shadow-lg' : 'text-red-400 hover:text-red-300 hover:bg-red-500/10'}`}
                        >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                            {showDeleteChoice ? 'Sair da Exclusão' : 'Excluir Projeto'}
                        </button>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all font-bold text-xs uppercase"
                        >
                            Fechar
                        </button>
                        <button
                            onClick={() => onEdit?.(project)}
                            className="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-lg font-bold shadow-lg shadow-primary/20 transition-all flex items-center gap-2 text-xs uppercase"
                        >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                            Editar Detalhes
                        </button>
                    </div>
                </div>

                {/* Delete Sub-menu */}
                {showDeleteChoice && (
                    <div className="p-6 pt-0 border-t border-white/5 bg-background-dark/80 backdrop-blur-md">
                        <p className="text-[10px] font-black uppercase text-red-500 tracking-widest mb-4 mt-4 text-center">Zona de Perigo: Escolha o que excluir</p>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <button
                                onClick={() => handleDeletePhase('A')}
                                className="flex flex-col items-center gap-2 p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-red-500/10 hover:border-red-500/30 transition-all group"
                            >
                                <span className="material-symbols-outlined text-slate-500 group-hover:text-red-500">architecture</span>
                                <span className="text-[10px] font-bold text-slate-400 group-hover:text-white uppercase">Fase A</span>
                            </button>
                            <button
                                onClick={() => handleDeletePhase('B')}
                                className="flex flex-col items-center gap-2 p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-red-500/10 hover:border-red-500/30 transition-all group"
                            >
                                <span className="material-symbols-outlined text-slate-500 group-hover:text-red-500">dataset_linked</span>
                                <span className="text-[10px] font-bold text-slate-400 group-hover:text-white uppercase">Fase B</span>
                            </button>
                            <button
                                onClick={() => handleDeletePhase('C')}
                                className="flex flex-col items-center gap-2 p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-red-500/10 hover:border-red-500/30 transition-all group"
                            >
                                <span className="material-symbols-outlined text-slate-500 group-hover:text-red-500">description</span>
                                <span className="text-[10px] font-bold text-slate-400 group-hover:text-white uppercase">Fase C</span>
                            </button>
                            <button
                                onClick={() => handleDeletePhase('ALL')}
                                className="flex flex-col items-center gap-2 p-3 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500 hover:border-red-500 transition-all group"
                            >
                                <span className="material-symbols-outlined text-red-500 group-hover:text-white font-black">delete_forever</span>
                                <span className="text-[10px] font-black text-red-500 group-hover:text-white uppercase">Excluir Tudo</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProjectDetailsModal;
