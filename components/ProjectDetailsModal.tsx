import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Project, AppView } from '../types';

interface ProjectDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    project: Project | null;
    onUpdate: () => void;
    onViewChange: (view: AppView) => void;
    onSelectProject: (id: string) => void;
    onEdit?: (project: Project) => void;
    hasProposal?: boolean;
}

const ProjectDetailsModal: React.FC<ProjectDetailsModalProps> = ({
    isOpen,
    onClose,
    project,
    onUpdate,
    onViewChange,
    onSelectProject,
    onEdit,
    hasProposal
}) => {
    const [updating, setUpdating] = useState(false);
    const [projectServices, setProjectServices] = useState<any[]>([]);
    const [showEditChoice, setShowEditChoice] = useState(false);
    const [showDeleteChoice, setShowDeleteChoice] = useState(false);

    useEffect(() => {
        if (isOpen && project) {
            fetchProjectServices();
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

    if (!isOpen || !project) return null;

    const handleStatusChange = async (newStatus: 'ANALYSIS' | 'APPROVED' | 'EXECUTION' | 'DONE') => {
        setUpdating(true);
        try {
            const { error: updateError } = await supabase
                .from('projects')
                .update({ status: newStatus })
                .eq('id', project.id);

            if (updateError) throw updateError;

            if (newStatus === 'DONE') {
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
                await supabase.from('project_services').delete().eq('project_id', project.id);
                await supabase.from('tasks').delete().eq('project_id', project.id);
                const { error } = await supabase.from('projects').delete().eq('id', project.id);
                if (error) throw error;
                onUpdate();
                onClose();
            } else {
                alert('Fase limpa com sucesso!');
                onUpdate();
                setShowDeleteChoice(false);
            }
        } catch (error: any) {
            console.error(error);
            alert('Erro ao realizar ação: ' + (error.message || 'Verifique as dependências.'));
        } finally {
            setUpdating(false);
        }
    };

    const handleDelete = () => setShowDeleteChoice(!showDeleteChoice);

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
                        <p className="text-sm text-slate-400 mt-1">{project.client}</p>
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

                        {showDeleteChoice && (
                            <div className="absolute bottom-full left-0 mb-2 w-64 bg-surface-dark border border-white/10 rounded-xl shadow-2xl p-2 z-[60] animate-in fade-in slide-in-from-bottom-2 duration-200">
                                <div className="text-[10px] font-bold text-slate-500 uppercase px-3 py-2 border-b border-white/5 mb-1">
                                    O que deseja limpar?
                                </div>
                                <button
                                    onClick={() => handleDeletePhase('A')}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-left group/item"
                                >
                                    <div className="h-8 w-8 rounded bg-yellow-500/10 flex items-center justify-center text-yellow-500 group-hover/item:scale-110 transition-transform">
                                        <span className="material-symbols-outlined text-[18px]">architecture</span>
                                    </div>
                                    <div>
                                        <div className="text-white text-[13px] font-bold">Limpar Levantamento</div>
                                        <div className="text-[10px] text-slate-500">Remove todos os pavimentos</div>
                                    </div>
                                </button>

                                <button
                                    onClick={() => handleDeletePhase('B')}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-left group/item"
                                >
                                    <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center text-primary group-hover/item:scale-110 transition-transform">
                                        <span className="material-symbols-outlined text-[18px]">engineering</span>
                                    </div>
                                    <div>
                                        <div className="text-white text-[13px] font-bold">Limpar Composição</div>
                                        <div className="text-[10px] text-slate-500">Remove itens calculados</div>
                                    </div>
                                </button>

                                <button
                                    onClick={() => handleDeletePhase('C')}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-left group/item"
                                >
                                    <div className="h-8 w-8 rounded bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover/item:scale-110 transition-transform">
                                        <span className="material-symbols-outlined text-[18px]">description</span>
                                    </div>
                                    <div>
                                        <div className="text-white text-[13px] font-bold">Limpar Proposta</div>
                                        <div className="text-[10px] text-slate-500">Remove settings e itens manuais</div>
                                    </div>
                                </button>

                                <div className="border-t border-white/5 my-1"></div>

                                <button
                                    onClick={() => handleDeletePhase('ALL')}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-500/20 transition-colors text-left group/item text-red-500"
                                >
                                    <div className="h-8 w-8 rounded bg-red-500/10 flex items-center justify-center group-hover/item:scale-110 transition-transform">
                                        <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                                    </div>
                                    <div>
                                        <div className="text-[13px] font-bold">Excluir Tudo</div>
                                        <div className="text-[10px] text-red-500/60 font-bold uppercase">Ação Irreversível</div>
                                    </div>
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3">
                        <div className="relative group">
                            <button
                                onClick={() => setShowEditChoice(!showEditChoice)}
                                className={`px-4 py-2 border rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${showEditChoice ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20' : 'bg-surface-dark border-white/10 text-white hover:bg-white/5'}`}
                            >
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                                {showEditChoice ? 'Sair da Edição' : 'Editar Projeto'}
                            </button>

                            {showEditChoice && (
                                <div className="absolute bottom-full right-0 mb-2 w-64 bg-surface-dark border border-white/10 rounded-xl shadow-2xl p-2 z-[60] animate-in fade-in slide-in-from-bottom-2 duration-200">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase px-3 py-2 border-b border-white/5 mb-1">
                                        Selecione o que editar
                                    </div>
                                    <button
                                        onClick={() => {
                                            onEdit?.(project);
                                            setShowEditChoice(false);
                                        }}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-left group/item"
                                    >
                                        <div className="h-8 w-8 rounded bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover/item:scale-110 transition-transform">
                                            <span className="material-symbols-outlined text-[18px]">info</span>
                                        </div>
                                        <div>
                                            <div className="text-white text-[13px] font-bold">Informações Básicas</div>
                                            <div className="text-[10px] text-slate-500">Nome, cliente, tipo e obs.</div>
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => {
                                            onSelectProject(project.id);
                                            onViewChange(AppView.ENGINEERING_PHASE_A);
                                            onClose();
                                        }}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-left group/item"
                                    >
                                        <div className="h-8 w-8 rounded bg-yellow-500/10 flex items-center justify-center text-yellow-500 group-hover/item:scale-110 transition-transform">
                                            <span className="material-symbols-outlined text-[18px]">architecture</span>
                                        </div>
                                        <div>
                                            <div className="text-white text-[13px] font-bold">Levantamento (Fase A)</div>
                                            <div className="text-[10px] text-slate-500">Pavimentos e especificações</div>
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => {
                                            onSelectProject(project.id);
                                            onViewChange(AppView.ENGINEERING_PHASE_B);
                                            onClose();
                                        }}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-left group/item"
                                    >
                                        <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center text-primary group-hover/item:scale-110 transition-transform">
                                            <span className="material-symbols-outlined text-[18px]">engineering</span>
                                        </div>
                                        <div>
                                            <div className="text-white text-[13px] font-bold">Composição (Fase B)</div>
                                            <div className="text-[10px] text-slate-500">Cálculos e dimensionamento</div>
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => {
                                            onSelectProject(project.id);
                                            onViewChange(AppView.ENGINEERING_PHASE_C);
                                            onClose();
                                        }}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-left group/item"
                                    >
                                        <div className="h-8 w-8 rounded bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover/item:scale-110 transition-transform">
                                            <span className="material-symbols-outlined text-[18px]">description</span>
                                        </div>
                                        <div>
                                            <div className="text-white text-[13px] font-bold">Proposta (Fase C)</div>
                                            <div className="text-[10px] text-slate-500">Itens, valores e PDF final</div>
                                        </div>
                                    </button>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => {
                                if (project) {
                                    onSelectProject(project.id);
                                    onViewChange(AppView.ENGINEERING_PHASE_A);
                                    onClose();
                                }
                            }}
                            className="px-4 py-2 bg-surface-dark border border-white/10 text-white rounded-lg font-bold text-sm hover:bg-white/5 transition-colors"
                        >
                            Ver Levantamento
                        </button>

                        {hasProposal && (
                            <button
                                onClick={() => {
                                    if (project) {
                                        onSelectProject(project.id);
                                        onViewChange(AppView.ENGINEERING_PHASE_C);
                                        onClose();
                                    }
                                }}
                                className="px-4 py-2 bg-emerald-600 border border-emerald-500/20 text-white rounded-lg font-bold text-sm hover:bg-emerald-500 transition-colors flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined text-[18px]">description</span>
                                Ver Proposta
                            </button>
                        )}

                        <button
                            onClick={() => {
                                if (project) {
                                    onSelectProject(project.id);
                                    onViewChange(AppView.ENGINEERING_PHASE_B);
                                    onClose();
                                }
                            }}
                            className="px-6 py-2 bg-primary text-white rounded-lg font-bold text-sm hover:bg-primary-dark shadow-lg shadow-primary/20 transition-all flex items-center gap-2"
                        >
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
