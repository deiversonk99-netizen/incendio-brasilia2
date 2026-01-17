import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface ProposalSection {
    id: string;
    title: string;
    content: string;
    order_index: number;
    is_active: boolean;
}

interface ProposalTemplate {
    id: string;
    title: string;
    content: string;
}

interface ProposalSectionsProps {
    projectId: string;
    sections: ProposalSection[];
    onUpdate: () => void;
}

const ProposalSections: React.FC<ProposalSectionsProps> = ({ projectId, sections, onUpdate }) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({ title: '', content: '', saveAsTemplate: false });
    const [loading, setLoading] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);
    const [templates, setTemplates] = useState<ProposalTemplate[]>([]);

    useEffect(() => {
        fetchTemplates();
    }, []);

    const fetchTemplates = async () => {
        const { data } = await supabase.from('proposal_templates').select('*').order('title');
        if (data) setTemplates(data);
    };

    const handleSave = async () => {
        if (!formData.title) return;
        setLoading(true);

        try {
            // 1. Save Section to Project
            if (editingId && editingId !== 'new') {
                const { error } = await supabase
                    .from('proposal_sections')
                    .update({ title: formData.title, content: formData.content })
                    .eq('id', editingId);
                if (error) throw error;
            } else {
                const maxOrder = sections.length > 0 ? Math.max(...sections.map(s => s.order_index)) : 0;
                const { error } = await supabase.from('proposal_sections').insert({
                    project_id: projectId,
                    title: formData.title,
                    content: formData.content,
                    order_index: maxOrder + 1
                });
                if (error) throw error;
            }

            // 2. Save as Global Template if checked
            if (formData.saveAsTemplate) {
                // Check if template with same title exists
                const { data: existing } = await supabase
                    .from('proposal_templates')
                    .select('id')
                    .eq('title', formData.title)
                    .single();

                if (existing) {
                    await supabase
                        .from('proposal_templates')
                        .update({ content: formData.content })
                        .eq('id', existing.id);
                } else {
                    await supabase.from('proposal_templates').insert({
                        title: formData.title,
                        content: formData.content
                    });
                }
                fetchTemplates();
            }

            setEditingId(null);
            setFormData({ title: '', content: '', saveAsTemplate: false });
            onUpdate();
        } catch (e: any) {
            alert('Erro ao salvar seção: ' + e.message);
        }
        setLoading(false);
    };

    const deleteTemplate = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('Excluir este modelo permanentemente?')) return;
        try {
            await supabase.from('proposal_templates').delete().eq('id', id);
            fetchTemplates();
        } catch (e) {
            console.error(e);
        }
    };

    const useTemplate = (template: { title: string, content: string }) => {
        setFormData({ title: template.title, content: template.content, saveAsTemplate: false });
        setEditingId('new');
        setShowTemplates(false);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Excluir esta seção?')) return;
        try {
            await supabase.from('proposal_sections').delete().eq('id', id);
            onUpdate();
        } catch (e) {
            console.error(e);
        }
    };

    const moveSection = async (id: string, direction: 'up' | 'down') => {
        const index = sections.findIndex(s => s.id === id);
        if (index < 0) return;
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= sections.length) return;

        const current = sections[index];
        const target = sections[targetIndex];

        await supabase.from('proposal_sections').update({ order_index: target.order_index }).eq('id', current.id);
        await supabase.from('proposal_sections').update({ order_index: current.order_index }).eq('id', target.id);
        onUpdate();
    };

    const toggleActive = async (section: ProposalSection) => {
        await supabase.from('proposal_sections').update({ is_active: !section.is_active }).eq('id', section.id);
        onUpdate();
    };

    return (
        <div className="bg-surface-dark border border-white/5 rounded-xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                <h3 className="text-white text-lg font-bold flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">feed</span>
                    Estrutura da Proposta (Escopo Dinâmico)
                </h3>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <button
                            onClick={() => setShowTemplates(!showTemplates)}
                            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg flex items-center gap-2 text-sm font-bold border border-white/10 transition-all"
                        >
                            <span className="material-symbols-outlined text-[18px]">temp_preferences_custom</span>
                            Modelos Prontos
                            <span className="material-symbols-outlined text-[18px]">{showTemplates ? 'expand_less' : 'expand_more'}</span>
                        </button>

                        {showTemplates && (
                            <div className="absolute right-0 mt-2 w-80 bg-surface-dark border border-white/10 rounded-xl shadow-2xl z-50 p-2 animate-in fade-in zoom-in-95 duration-200">
                                <p className="text-[10px] text-slate-500 font-bold uppercase p-2 tracking-wider">Modelos Disponíveis</p>
                                <div className="max-h-64 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-white/10">
                                    {templates.map((tpl) => (
                                        <div key={tpl.id} className="group relative">
                                            <button
                                                onClick={() => useTemplate(tpl)}
                                                className="w-full text-left p-3 rounded-lg hover:bg-white/5 transition-colors pr-10"
                                            >
                                                <div className="text-white text-xs font-bold mb-1 group-hover:text-primary">{tpl.title}</div>
                                                <div className="text-[10px] text-slate-500 line-clamp-1">{tpl.content}</div>
                                            </button>
                                            <button
                                                onClick={(e) => deleteTemplate(e, tpl.id)}
                                                className="absolute right-2 top-3 p-1.5 text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded hover:bg-red-500/10"
                                                title="Excluir Modelo"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">delete</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={() => { setEditingId('new'); setFormData({ title: '', content: '', saveAsTemplate: false }); }}
                        className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg flex items-center gap-2 text-sm font-bold shadow-lg shadow-primary/20 transition-all"
                    >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                        Adicionar Seção
                    </button>
                </div>
            </div>

            {editingId && (
                <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/10 animate-in slide-in-from-top-2 shadow-inner">
                    <input
                        className="w-full bg-background-dark border border-white/10 rounded-lg px-4 py-2 text-white mb-3 font-bold focus:border-primary outline-none transition-colors"
                        placeholder="Título da Seção (ex: DO OBJETO)"
                        value={formData.title}
                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                    />
                    <textarea
                        className="w-full bg-background-dark border border-white/10 rounded-lg px-4 py-3 text-white h-40 resize-none mb-3 focus:border-primary outline-none transition-colors scrollbar-thin scrollbar-thumb-white/10"
                        placeholder="Conteúdo da seção..."
                        value={formData.content}
                        onChange={e => setFormData({ ...formData, content: e.target.value })}
                    />
                    <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <div className={`w-4 h-4 rounded border transition-all flex items-center justify-center ${formData.saveAsTemplate ? 'bg-primary border-primary' : 'bg-background-dark border-white/20 group-hover:border-white/40'}`}>
                                {formData.saveAsTemplate && <span className="material-symbols-outlined text-white text-[12px] font-bold">check</span>}
                            </div>
                            <input
                                type="checkbox"
                                className="hidden"
                                checked={formData.saveAsTemplate}
                                onChange={e => setFormData({ ...formData, saveAsTemplate: e.target.checked })}
                            />
                            <span className="text-xs text-slate-400 font-medium">Salvar/Atualizar este texto nos Modelos Prontos</span>
                        </label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setEditingId(null)}
                                className="px-4 py-2 text-slate-400 hover:text-white font-medium transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={loading}
                                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow-lg shadow-emerald-900/10 transition-all flex items-center gap-2"
                            >
                                {loading && <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>}
                                {loading ? 'Salvando...' : 'Salvar Seção'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-3">
                {sections.map((section, idx) => (
                    <div key={section.id} className={`p-4 rounded-lg border transition-all ${section.is_active ? 'bg-background-dark border-white/10 hover:border-white/20' : 'bg-red-500/5 border-red-500/20 opacity-75'}`}>
                        <div className="flex items-start gap-4">
                            <div className="flex flex-col gap-1 pt-1">
                                <button
                                    onClick={() => moveSection(section.id, 'up')}
                                    disabled={idx === 0}
                                    className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/5 text-slate-500 hover:text-white disabled:opacity-10 transition-colors"
                                    title="Mover para Cima"
                                >
                                    <span className="material-symbols-outlined text-[20px]">keyboard_arrow_up</span>
                                </button>
                                <button
                                    onClick={() => moveSection(section.id, 'down')}
                                    disabled={idx === sections.length - 1}
                                    className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/5 text-slate-500 hover:text-white disabled:opacity-10 transition-colors"
                                    title="Mover para Baixo"
                                >
                                    <span className="material-symbols-outlined text-[20px]">keyboard_arrow_down</span>
                                </button>
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-1">
                                    <div className="w-6 h-6 rounded flex items-center justify-center bg-white/5 text-[10px] text-slate-500 font-bold border border-white/5">
                                        {idx + 1}
                                    </div>
                                    <h4 className="text-white font-bold truncate tracking-tight">{section.title}</h4>
                                    {!section.is_active && <span className="text-[10px] text-red-400 font-bold uppercase border border-red-500/30 px-1 rounded">Oculto</span>}
                                </div>
                                <p className="text-slate-400 text-xs line-clamp-2 leading-relaxed">{section.content}</p>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    onClick={() => toggleActive(section)}
                                    className={`p-2 rounded hover:bg-white/5 transition-colors ${section.is_active ? 'text-emerald-500' : 'text-slate-500'}`}
                                    title={section.is_active ? "Ocultar no PDF" : "Exibir no PDF"}
                                >
                                    <span className="material-symbols-outlined text-[20px]">{section.is_active ? 'visibility' : 'visibility_off'}</span>
                                </button>
                                <button
                                    onClick={() => { setEditingId(section.id); setFormData({ title: section.title, content: section.content, saveAsTemplate: false }); }}
                                    className="p-2 rounded hover:bg-white/5 text-slate-400 hover:text-primary transition-colors"
                                    title="Editar"
                                >
                                    <span className="material-symbols-outlined text-[20px]">edit</span>
                                </button>
                                <button
                                    onClick={() => handleDelete(section.id)}
                                    className="p-2 rounded hover:bg-white/5 text-slate-400 hover:text-rose-500 transition-colors"
                                    title="Excluir"
                                >
                                    <span className="material-symbols-outlined text-[20px]">delete</span>
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ProposalSections;
