import React, { useState, useEffect } from 'react';
import PageHeader from './PageHeader';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface KitComponent {
    id?: string;
    product_name: string;
    conversion_factor: number;
}

interface Kit {
    id: string;
    name: string;
    loss_percentage: number;
    components?: KitComponent[];
}

const KitsConfigurationView: React.FC = () => {
    const { session } = useAuth();
    const [kits, setKits] = useState<Kit[]>([]);
    const [loading, setLoading] = useState(false);
    const [editingKit, setEditingKit] = useState<Kit | null>(null);

    // Catalog State
    const [catalog, setCatalog] = useState<{ name: string }[]>([]);
    const [catalogSearch, setCatalogSearch] = useState('');

    // Editor State
    const [kitName, setKitName] = useState('');
    const [lossPercentage, setLossPercentage] = useState(10);
    const [components, setComponents] = useState<KitComponent[]>([
        { product_name: '', conversion_factor: 1.0 }
    ]);

    useEffect(() => {
        fetchKits();
        fetchCatalog();
    }, []);

    const fetchKits = async () => {
        setLoading(true);
        const { data } = await supabase.from('composition_kits').select('*').order('name');
        if (data) setKits(data);
        setLoading(false);
    };

    const fetchCatalog = async () => {
        // Fetch names for autocomplete
        const { data } = await supabase.from('product_catalog').select('name').order('name');
        if (data) setCatalog(data);
    };

    const startNewKit = () => {
        setEditingKit({ id: 'new', name: '', loss_percentage: 10, components: [] });
        setKitName('');
        setLossPercentage(10);
        setComponents([{ product_name: '', conversion_factor: 1.0 }]);
    };

    const handleEditKit = async (kit: Kit) => {
        const { data } = await supabase.from('kit_components').select('*').eq('kit_id', kit.id);

        setEditingKit(kit);
        setKitName(kit.name);
        setLossPercentage(kit.loss_percentage);
        setComponents(data || []);
    };

    const addComponentRow = () => {
        setComponents([...components, { product_name: '', conversion_factor: 1.0 }]);
    };

    const updateComponent = (index: number, field: keyof KitComponent, value: any) => {
        const newComponents = [...components];
        newComponents[index] = { ...newComponents[index], [field]: value };
        setComponents(newComponents);
    };

    const removeComponent = (index: number) => {
        setComponents(components.filter((_, i) => i !== index));
    };

    const handleSaveKit = async () => {
        if (!session?.user) return;
        if (!kitName) { alert('Nome do kit é obrigatório'); return; }

        try {
            let kitId = editingKit?.id;

            if (kitId === 'new') {
                const { data, error } = await supabase.from('composition_kits').insert({
                    user_id: session.user.id,
                    name: kitName,
                    loss_percentage: lossPercentage
                }).select().single();
                if (error) throw error;
                kitId = data.id;
            } else {
                const { error } = await supabase.from('composition_kits').update({
                    name: kitName,
                    loss_percentage: lossPercentage
                }).eq('id', kitId);
                if (error) throw error;
            }

            if (kitId && kitId !== 'new') {
                await supabase.from('kit_components').delete().eq('kit_id', kitId);
                const componentsToInsert = components
                    .filter(c => c.product_name)
                    .map(c => ({
                        kit_id: kitId,
                        product_name: c.product_name,
                        conversion_factor: c.conversion_factor
                    }));
                if (componentsToInsert.length > 0) {
                    const { error } = await supabase.from('kit_components').insert(componentsToInsert);
                    if (error) throw error;
                }
            }

            alert('Kit salvo com sucesso!');
            setEditingKit(null);
            fetchKits();

        } catch (error) {
            console.error(error);
            alert('Erro ao salvar kit.');
        }
    };

    const handleDeleteKit = async (id: string) => {
        if (!confirm('Tem certeza? Isso pode afetar projetos passados.')) return;

        try {
            // Delete related components first (manual cascade)
            const { error: compError } = await supabase.from('kit_components').delete().eq('kit_id', id);
            if (compError) throw compError;

            // Delete the kit
            const { error } = await supabase.from('composition_kits').delete().eq('id', id);
            if (error) throw error;

            fetchKits();
        } catch (error) {
            console.error('Error deleting kit:', error);
            alert('Erro ao excluir kit. Tente novamente.');
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <PageHeader
                title="Kits de Composição"
                subtitle="Gerencie as receitas de conversão de infraestrutura para materiais."
                actions={
                    !editingKit ? (
                        <button
                            onClick={startNewKit}
                            className="flex items-center gap-2 h-10 px-6 rounded-lg bg-primary hover:bg-primary-dark text-white shadow-lg shadow-primary/20 transition-all font-bold text-sm">
                            <span className="material-symbols-outlined text-[18px]">add</span>
                            Novo Kit
                        </button>
                    ) : (
                        <button
                            onClick={() => setEditingKit(null)}
                            className="flex items-center gap-2 h-10 px-6 rounded-lg bg-surface-dark border border-white/10 hover:bg-white/5 text-white transition-all font-bold text-sm">
                            Voltar
                        </button>
                    )
                }
            />

            <main className="flex-1 overflow-y-auto p-4 lg:p-8">
                <div className="max-w-7xl mx-auto">

                    {editingKit ? (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                            <div className="lg:col-span-4 space-y-6">
                                <div className="bg-surface-dark p-6 rounded-xl border border-white/5">
                                    <h3 className="text-lg font-bold text-white mb-4">Configuração Básica</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm text-slate-400 mb-1">Nome do Kit</label>
                                            <input
                                                className="w-full bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-white focus:border-primary outline-none"
                                                placeholder="Ex: Infra Eletroduto 3/4"
                                                value={kitName}
                                                onChange={e => setKitName(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-slate-400 mb-1">Percentual de Perda (%)</label>
                                            <input
                                                type="number"
                                                className="w-full bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-white focus:border-primary outline-none"
                                                value={lossPercentage}
                                                onChange={e => setLossPercentage(Number(e.target.value))}
                                            />
                                            <p className="text-xs text-slate-500 mt-1">Margem de segurança aplicada no final do cálculo.</p>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={handleSaveKit}
                                    className="w-full bg-primary hover:bg-primary-dark text-white py-3 rounded-xl font-bold shadow-lg shadow-primary/20 transition-all">
                                    Salvar Kit
                                </button>
                            </div>

                            <div className="lg:col-span-8">
                                <div className="bg-surface-dark p-6 rounded-xl border border-white/5">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-bold text-white">Componentes do Kit</h3>
                                        <button onClick={addComponentRow} className="text-primary text-sm font-bold hover:underline">+ Adicionar Item</button>
                                    </div>

                                    <div className="bg-primary/5 border border-primary/20 p-4 rounded-lg mb-6 text-sm">
                                        <p className="text-primary font-bold mb-2 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-sm">info</span>
                                            Como funciona o Fator de Conversão?
                                        </p>
                                        <p className="text-slate-300 mb-2">
                                            O fator define a quantidade de material gasta <strong>para cada 1 metro</strong> de infraestrutura.
                                        </p>
                                        <ul className="list-disc pl-5 text-xs text-slate-400 space-y-1">
                                            <li><strong>Fator 1.0</strong> = Usa-se 1 unidade a cada 1 metro.</li>
                                            <li><strong>Fator 1.2</strong> = Usa-se 1.2m de tubo (considerando cortes) para cada 1m de infra.</li>
                                            <li><strong>Fator 0.25</strong> = Usa-se 1 unidade a cada 4 metros (ex: conexões).</li>
                                        </ul>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="grid grid-cols-12 gap-4 text-xs font-bold text-slate-500 uppercase px-2">
                                            <div className="col-span-7">Produto (Do Catálogo)</div>
                                            <div className="col-span-3 text-center">Fator (qtd/m)</div>
                                            <div className="col-span-2"></div>
                                        </div>

                                        {components.map((comp, idx) => (
                                            <div key={idx} className="grid grid-cols-12 gap-4 items-center bg-background-dark/50 p-2 rounded-lg border border-white/5">
                                                <div className="col-span-7 relative">
                                                    <input
                                                        className="w-full bg-transparent border-none text-white placeholder-slate-600 focus:ring-0"
                                                        placeholder="Digite p/ buscar..."
                                                        list={`catalog-list-${idx}`}
                                                        value={comp.product_name}
                                                        onChange={e => updateComponent(idx, 'product_name', e.target.value)}
                                                    />
                                                    <datalist id={`catalog-list-${idx}`}>
                                                        {catalog.map((p, i) => (<option key={i} value={p.name} />))}
                                                    </datalist>
                                                </div>
                                                <div className="col-span-3">
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        className="w-full bg-background-dark border border-white/10 rounded text-center text-primary font-bold py-1"
                                                        value={comp.conversion_factor}
                                                        onChange={e => updateComponent(idx, 'conversion_factor', Number(e.target.value))}
                                                    />
                                                </div>
                                                <div className="col-span-2 text-right">
                                                    <button onClick={() => removeComponent(idx)} className="text-red-500 hover:bg-red-500/10 p-1.5 rounded transition-colors">
                                                        <span className="material-symbols-outlined text-sm">delete</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {kits.map(kit => (
                                <div key={kit.id} className="bg-surface-dark border border-white/5 rounded-xl p-6 hover:border-primary/50 transition-colors group">
                                    <div className="flex justify-between items-start mb-4">
                                        <span className="p-3 bg-primary/10 text-primary rounded-lg">
                                            <span className="material-symbols-outlined">dataset</span>
                                        </span>
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleEditKit(kit)} className="p-2 hover:bg-white/10 rounded-full text-slate-300">
                                                <span className="material-symbols-outlined text-sm">edit</span>
                                            </button>
                                            <button onClick={() => handleDeleteKit(kit.id)} className="p-2 hover:bg-red-500/20 rounded-full text-red-500">
                                                <span className="material-symbols-outlined text-sm">delete</span>
                                            </button>
                                        </div>
                                    </div>
                                    <h3 className="text-white font-bold text-lg mb-1">{kit.name}</h3>
                                    <div className="flex items-center gap-2 text-sm text-slate-400">
                                        <span className="material-symbols-outlined text-sm">trending_down</span>
                                        Perda de <span className="text-white font-bold">{kit.loss_percentage}%</span>
                                    </div>
                                </div>
                            ))}

                            {kits.length === 0 && !loading && (
                                <div className="col-span-full py-12 text-center text-slate-500">
                                    Nenhum kit configurado. Clique em "Novo Kit" para começar.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default KitsConfigurationView;
