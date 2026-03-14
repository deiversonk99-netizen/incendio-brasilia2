import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
export interface StatusColumn {
    id: string;
    label: string;
    color: string;
    shadow_class: string;
    order_index: number;
    project_types?: string[];
    allowed_labels?: string[];
    allowed_clients?: string[];
}

interface ManageColumnsModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentColumns: StatusColumn[];
    onSaved: (newColumns: StatusColumn[]) => void;
    availableLabels: { color: string; label: string }[];
    availableClients: string[];
}

const PROJECT_TYPES = [
    { id: 'business', label: 'Comercial' },
    { id: 'factory', label: 'Industrial' },
    { id: 'store', label: 'Loja' },
    { id: 'residential', label: 'Residencial' },
];

const COLORS = [
    { color: 'bg-blue-400', shadow: 'shadow-[0_0_8px_rgba(96,165,250,0.6)]' },
    { color: 'bg-yellow-400', shadow: 'shadow-[0_0_8px_rgba(250,204,21,0.6)]' },
    { color: 'bg-primary', shadow: 'shadow-[0_0_8px_rgba(226,29,72,0.6)]' },
    { color: 'bg-emerald-400', shadow: 'shadow-[0_0_8px_rgba(52,211,153,0.6)]' },
    { color: 'bg-purple-400', shadow: 'shadow-[0_0_8px_rgba(192,132,252,0.6)]' },
    { color: 'bg-orange-400', shadow: 'shadow-[0_0_8px_rgba(251,146,60,0.6)]' },
    { color: 'bg-slate-400', shadow: 'shadow-[0_0_8px_rgba(148,163,184,0.6)]' },
    { color: 'bg-pink-400', shadow: 'shadow-[0_0_8px_rgba(244,114,182,0.6)]' },
];

const ManageColumnsModal = ({ isOpen, onClose, currentColumns, onSaved, availableLabels, availableClients }: ManageColumnsModalProps) => {
    const { user } = useAuth();
    const [columns, setColumns] = useState<StatusColumn[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setColumns([...currentColumns].sort((a, b) => a.order_index - b.order_index));
        }
    }, [isOpen, currentColumns]);

    const handleAddColumn = () => {
        const defaultColor = COLORS[columns.length % COLORS.length];
        setColumns([...columns, {
            id: `new-${Date.now()}`,
            label: 'Nova Coluna',
            color: defaultColor.color,
            shadow_class: defaultColor.shadow,
            order_index: columns.length,
            project_types: ['business', 'factory', 'store', 'residential'],
            allowed_labels: [],
            allowed_clients: []
        }]);
    };

    const handleUpdateColumn = (id: string, field: keyof StatusColumn, value: any) => {
        setColumns(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
    };

    const handleDeleteColumn = (id: string) => {
        if (!confirm('Tem certeza? Se houver projetos nesta coluna, eles não aparecerão no quadro até você mudá-los de status!')) return;
        setColumns(prev => prev.filter(c => c.id !== id));
    };

    const handleMoveUp = (index: number) => {
        if (index === 0) return;
        const newCols = [...columns];
        const temp = newCols[index];
        newCols[index] = newCols[index - 1];
        newCols[index - 1] = temp;

        // Update order_indexes
        newCols.forEach((c, i) => c.order_index = i);
        setColumns(newCols);
    };

    const handleMoveDown = (index: number) => {
        if (index === columns.length - 1) return;
        const newCols = [...columns];
        const temp = newCols[index];
        newCols[index] = newCols[index + 1];
        newCols[index + 1] = temp;

        // Update order_indexes
        newCols.forEach((c, i) => c.order_index = i);
        setColumns(newCols);
    };

    const handleSave = async () => {
        if (!user) return;
        setLoading(true);

        try {
            // Find deleted columns
            const originalIds = currentColumns.map(c => c.id);
            const currentIds = columns.filter(c => !c.id.startsWith('new-')).map(c => c.id);
            const deletedIds = originalIds.filter(id => !currentIds.includes(id));

            if (deletedIds.length > 0) {
                await supabase.from('project_status_columns').delete().in('id', deletedIds);
            }

            // Upsert columns
            for (const col of columns) {
                if (col.id.startsWith('new-')) {
                    await supabase.from('project_status_columns').insert({
                        user_id: user.id,
                        label: col.label,
                        color: col.color,
                        shadow_class: col.shadow_class,
                        order_index: col.order_index,
                        project_types: col.project_types || ['business', 'factory', 'store', 'residential'],
                        allowed_labels: col.allowed_labels || [],
                        allowed_clients: col.allowed_clients || []
                    });
                } else {
                    await supabase.from('project_status_columns').update({
                        label: col.label,
                        color: col.color,
                        shadow_class: col.shadow_class,
                        order_index: col.order_index,
                        project_types: col.project_types || ['business', 'factory', 'store', 'residential'],
                        allowed_labels: col.allowed_labels || [],
                        allowed_clients: col.allowed_clients || []
                    }).eq('id', col.id);
                }
            }

            // Fetch fresh to get actual IDs generated by DB (Global fetch)
            const { data: freshData, error: fetchError } = await supabase
                .from('project_status_columns')
                .select('*')
                .order('order_index', { ascending: true });

            if (freshData) {
                onSaved(freshData);
                alert('Colunas salvas com sucesso!');
                onClose();
            } else if (fetchError) {
                throw fetchError;
            }
        } catch (error: any) {
            console.error('Error saving columns:', error);
            alert('Erro ao salvar colunas: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-surface-dark border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5 shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-white">Opções de Status</h2>
                        <p className="text-sm text-slate-400 mt-1">Gerencie as colunas do seu Gestão de Projetos</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-4">
                    {columns.map((col, index) => (
                        <div key={col.id} className="flex flex-col sm:flex-row gap-4 items-start sm:items-center bg-background-dark p-4 rounded-xl border border-white/5">

                            <div className="flex flex-col gap-1 items-center justify-center">
                                <button type="button" onClick={() => handleMoveUp(index)} disabled={index === 0} className={`material-symbols-outlined text-[20px] ${index === 0 ? 'text-slate-600' : 'text-slate-400 hover:text-white'}`}>arrow_drop_up</button>
                                <button type="button" onClick={() => handleMoveDown(index)} disabled={index === columns.length - 1} className={`material-symbols-outlined text-[20px] ${index === columns.length - 1 ? 'text-slate-600' : 'text-slate-400 hover:text-white'}`}>arrow_drop_down</button>
                            </div>

                            <div className="flex-1 w-full">
                                <input
                                    type="text"
                                    value={col.label}
                                    onChange={(e) => handleUpdateColumn(col.id, 'label', e.target.value)}
                                    placeholder="Nome da Coluna"
                                    className="w-full bg-surface-dark border border-white/10 rounded-lg px-3 py-2 text-white focus:border-primary outline-none transition-all"
                                />
                                <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase font-bold text-slate-500">
                                    {PROJECT_TYPES.map(type => (
                                        <label key={type.id} className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded cursor-pointer hover:bg-white/10 transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={col.project_types?.includes(type.id) ?? true}
                                                onChange={(e) => {
                                                    const currentTypes = col.project_types || ['business', 'factory', 'store', 'residential'];
                                                    const newTypes = e.target.checked
                                                        ? [...currentTypes, type.id]
                                                        : currentTypes.filter(t => t !== type.id);
                                                    handleUpdateColumn(col.id, 'project_types', newTypes);
                                                }}
                                                className="accent-primary"
                                            />
                                            {type.label}
                                        </label>
                                    ))}
                                </div>

                                {/* Granular Filters: Labels */}
                                {availableLabels.length > 0 && (
                                    <div className="mt-3">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Sinalização (opcional)</p>
                                        <div className="flex flex-wrap gap-2">
                                            {availableLabels.map(def => (
                                                <label key={def.color} className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-all border ${col.allowed_labels?.includes(def.color) ? 'bg-primary/20 border-primary/50 text-white' : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10'}`}>
                                                    <input
                                                        type="checkbox"
                                                        className="hidden"
                                                        checked={col.allowed_labels?.includes(def.color) ?? false}
                                                        onChange={(e) => {
                                                            const current = col.allowed_labels || [];
                                                            const newValue = e.target.checked ? [...current, def.color] : current.filter(c => c !== def.color);
                                                            handleUpdateColumn(col.id, 'allowed_labels', newValue);
                                                        }}
                                                    />
                                                    <div className={`size-2 rounded-full ${def.color}`}></div>
                                                    <span className="text-[9px] font-bold uppercase">{def.label}</span>
                                                </label>
                                            ))}
                                            {(!col.allowed_labels || col.allowed_labels.length === 0) && <p className="text-[9px] text-slate-600 italic">Todas as cores permitidas</p>}
                                        </div>
                                    </div>
                                )}

                                {/* Granular Filters: Clients */}
                                {availableClients.length > 0 && (
                                    <div className="mt-3">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Clientes Específicos (opcional)</p>
                                        <div className="max-h-[80px] overflow-y-auto custom-scrollbar border border-white/5 rounded-lg p-2 bg-black/20">
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                                {availableClients.map(client => (
                                                    <label key={client} className="flex items-center gap-2 cursor-pointer group">
                                                        <input
                                                            type="checkbox"
                                                            checked={col.allowed_clients?.includes(client) ?? false}
                                                            onChange={(e) => {
                                                                const current = col.allowed_clients || [];
                                                                const newValue = e.target.checked ? [...current, client] : current.filter(c => c !== client);
                                                                handleUpdateColumn(col.id, 'allowed_clients', newValue);
                                                            }}
                                                            className="accent-primary size-3"
                                                        />
                                                        <span className="text-[9px] font-bold text-slate-400 group-hover:text-white truncate">{client}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                        {(!col.allowed_clients || col.allowed_clients.length === 0) && <p className="text-[9px] text-slate-600 mt-1 italic">Todos os clientes permitidos</p>}
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2 sm:max-w-[150px] justify-center">
                                {COLORS.map(c => (
                                    <button
                                        key={c.color}
                                        onClick={() => {
                                            handleUpdateColumn(col.id, 'color', c.color);
                                            handleUpdateColumn(col.id, 'shadow_class', c.shadow);
                                        }}
                                        className={`w-6 h-6 rounded-full ${c.color} ${col.color === c.color ? 'ring-2 ring-white scale-110 shadow-lg' : 'opacity-60 hover:opacity-100 hover:scale-110'} transition-all`}
                                    />
                                ))}
                            </div>

                            <div className="flex items-center">
                                <button
                                    onClick={() => handleDeleteColumn(col.id)}
                                    className="p-2 text-slate-500 hover:text-red-500 hover:bg-white/5 rounded-lg transition-all"
                                    title="Excluir Coluna"
                                >
                                    <span className="material-symbols-outlined text-[20px]">delete</span>
                                </button>
                            </div>
                        </div>
                    ))}

                    <button
                        onClick={handleAddColumn}
                        className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-white/10 rounded-xl text-slate-400 hover:text-white hover:border-primary/50 transition-all font-semibold"
                    >
                        <span className="material-symbols-outlined">add</span>
                        Adicionar Nova Coluna
                    </button>

                    <div className="mt-6 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3 text-sm text-blue-300">
                        <span className="material-symbols-outlined text-blue-400">info</span>
                        <p>As colunas exibidas no quadro de 'Gestão de Projetos' seguirão esta ordem configurada. Projetos que estiverem em uma coluna excluída não serão exibidos até a associação manual com outra em andamento.</p>
                    </div>
                </div>

                <div className="p-6 border-t border-white/10 bg-white/5 shrink-0 flex gap-3 justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-lg font-semibold text-slate-300 hover:bg-white/5 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={loading}
                        className="px-6 py-2.5 rounded-lg bg-primary font-semibold text-white shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all disabled:opacity-50"
                    >
                        {loading ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ManageColumnsModal;
