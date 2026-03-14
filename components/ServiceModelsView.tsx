
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Product } from '../types';
import PageHeader from './PageHeader';

interface ServiceModel {
    id: string;
    name: string;
    description: string;
    labor_price: number;
    user_id?: string;
    items?: ServiceModelItem[];
    // Calculated frontend fields
    total_products_price?: number;
    total_price?: number;
}

interface ServiceModelItem {
    id: string;
    service_model_id: string;
    product_id: string;
    quantity: number;
    product?: Product;
}

const ServiceModelsView: React.FC = () => {
    const [models, setModels] = useState<ServiceModel[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Editor State
    const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    // Form Data
    const [formData, setFormData] = useState<{
        name: string;
        description: string;
        labor_price: number;
        items: { product_id: string, quantity: number, product?: Product, id?: string }[]
    }>({
        name: '',
        description: '',
        labor_price: 0,
        items: []
    });

    // Product search state
    const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
    const [productSearchTerm, setProductSearchTerm] = useState('');
    const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
    const [allProducts, setAllProducts] = useState<Product[]>([]);

    useEffect(() => {
        fetchModels();
        fetchProducts();
    }, []);

    const fetchProducts = async () => {
        const { data } = await supabase.from('product_catalog').select('*').order('name');
        if (data) setAllProducts(data);
    };

    useEffect(() => {
        if (isProductSearchOpen) {
            const filtered = allProducts.filter(p =>
                p.name.toLowerCase().includes(productSearchTerm.toLowerCase())
            ).slice(0, 20); // Limit to 20 for performance
            setAvailableProducts(filtered);
        }
    }, [productSearchTerm, allProducts, isProductSearchOpen]);

    const fetchModels = async () => {
        setLoading(true);
        // Fetch models
        const { data: modelsData, error: modelsError } = await supabase
            .from('service_models')
            .select('*')
            .order('name');

        if (modelsError) {
            console.error('Error fetching models:', modelsError);
            setLoading(false);
            return;
        }

        // Fetch items for all models
        const { data: itemsData, error: itemsError } = await supabase
            .from('service_model_items')
            .select('*, product:product_catalog(*)')
            .in('service_model_id', modelsData.map(m => m.id));

        if (itemsError) {
            console.error('Error fetching items:', itemsError);
        }

        const modelsWithItems = modelsData.map(model => {
            const items = itemsData?.filter(i => i.service_model_id === model.id) || [];
            const itemsWithProducts = items as ServiceModelItem[];

            const totalProductsPrice = itemsWithProducts.reduce((sum, item) => {
                return sum + ((item.product?.price || 0) * item.quantity);
            }, 0);

            return {
                ...model,
                items: itemsWithProducts,
                total_products_price: totalProductsPrice,
                total_price: (model.labor_price || 0) + totalProductsPrice
            };
        });

        setModels(modelsWithItems);
        setLoading(false);
    };

    // Calculations
    const currentProductsTotal = formData.items.reduce((sum, item) => sum + ((item.product?.price || 0) * item.quantity), 0);
    const currentTotal = (formData.labor_price || 0) + currentProductsTotal;

    const handleSelectModel = (model: ServiceModel) => {
        setSelectedModelId(model.id);
        setIsCreating(false);
        setFormData({
            name: model.name,
            description: model.description || '',
            labor_price: model.labor_price || 0,
            items: model.items?.map(i => ({
                id: i.id,
                product_id: i.product_id,
                quantity: i.quantity,
                product: i.product
            })) || []
        });
        setIsProductSearchOpen(false);
    };

    const handleCreateNew = () => {
        setSelectedModelId(null);
        setIsCreating(true);
        setFormData({
            name: 'Novo Modelo',
            description: '',
            labor_price: 0,
            items: []
        });
        setIsProductSearchOpen(false);
    };

    const handleAddItem = (product: Product) => {
        // Check if already exists
        const exists = formData.items.find(i => i.product_id === product.id);
        if (exists) {
            alert('Este produto já está na lista.');
            return;
        }

        setFormData({
            ...formData,
            items: [...formData.items, { product_id: product.id, quantity: 1, product }]
        });
        setIsProductSearchOpen(false);
        setProductSearchTerm('');
    };

    const handleRemoveItem = (index: number) => {
        const newItems = [...formData.items];
        newItems.splice(index, 1);
        setFormData({ ...formData, items: newItems });
    };

    const handleUpdateItemQuantity = (index: number, newQuantity: number) => {
        const newItems = [...formData.items];
        newItems[index].quantity = newQuantity;
        setFormData({ ...formData, items: newItems });
    };

    const handleSave = async () => {
        setLoading(true);

        try {
            let modelId = selectedModelId;

            const modelPayload = {
                name: formData.name,
                description: formData.description,
                labor_price: formData.labor_price
            };

            if (modelId) {
                const { error } = await supabase
                    .from('service_models')
                    .update(modelPayload)
                    .eq('id', modelId);
                if (error) throw error;
            } else {
                const { data, error } = await supabase
                    .from('service_models')
                    .insert(modelPayload)
                    .select()
                    .single();
                if (error) throw error;
                modelId = data.id;
            }

            if (!modelId) throw new Error('Failed to get model ID');

            // Diff Items
            const { error: deleteError } = await supabase
                .from('service_model_items')
                .delete()
                .eq('service_model_id', modelId);

            if (deleteError) throw deleteError;

            if (formData.items.length > 0) {
                const itemsPayload = formData.items.map(i => ({
                    service_model_id: modelId,
                    product_id: i.product_id,
                    quantity: i.quantity
                }));

                const { error: insertError } = await supabase
                    .from('service_model_items')
                    .insert(itemsPayload);

                if (insertError) throw insertError;
            }

            await fetchModels();
            setSelectedModelId(modelId);
            setIsCreating(false);
            alert('Modelo salvo com sucesso!');

        } catch (error: any) {
            console.error('Error saving model:', error);
            alert('Erro ao salvar modelo: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir este modelo?')) return;

        const { error } = await supabase
            .from('service_models')
            .delete()
            .eq('id', id);

        if (error) {
            alert('Erro ao excluir: ' + error.message);
        } else {
            if (selectedModelId === id) {
                setSelectedModelId(null);
                setIsCreating(false);
            }
            fetchModels();
        }
    };

    const filteredModels = models.filter(m =>
        m.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <PageHeader
                title="Kits de Composição"
                subtitle="Gestão de composições de serviços e produtos."
            />

            <div className="flex-1 overflow-hidden flex flex-row">
                {/* LEFT SIDEBAR: LIST */}
                <div className="w-1/3 min-w-[300px] bg-surface-dark border-r border-white/10 flex flex-col">
                    <div className="p-4 border-b border-white/10">
                        <div className="relative mb-4">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">search</span>
                            <input
                                type="text"
                                placeholder="Buscar modelos..."
                                className="w-full bg-background-dark border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white outline-none focus:border-emerald-500 transition-all text-sm"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={handleCreateNew}
                            className="w-full btn-primary flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition-colors"
                        >
                            <span className="material-symbols-outlined text-[18px]">add</span>
                            NOVO MODELO
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                        {filteredModels.map(model => (
                            <div
                                key={model.id}
                                onClick={() => handleSelectModel(model)}
                                className={`p-4 rounded-lg cursor-pointer transition-all border ${selectedModelId === model.id
                                    ? 'bg-emerald-500/10 border-emerald-500 text-white'
                                    : 'bg-white/5 border-transparent hover:bg-white/10 text-slate-300'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className={`material-symbols-outlined ${selectedModelId === model.id ? 'text-emerald-500' : 'text-slate-500'}`}>
                                        design_services
                                    </span>
                                    <div className="overflow-hidden">
                                        <h4 className="font-bold truncate">{model.name}</h4>
                                        <p className="text-xs opacity-70 truncate">{model.items?.length || 0} produtos</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* RIGHT PANEL: EDITOR */}
                <div className="flex-1 bg-black/20 flex flex-col overflow-hidden">
                    {(selectedModelId || isCreating) ? (
                        <div className="flex flex-col h-full">
                            {/* HEADER EDITOR */}
                            <div className="p-6 border-b border-white/10 bg-surface-dark shadow-sm z-10">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex-1 mr-8">
                                        <label className="text-xs font-bold text-emerald-500 uppercase mb-1 block">Nome do Modelo</label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            className="w-full bg-transparent border-b border-white/10 text-2xl font-bold text-white focus:border-emerald-500 outline-none transition-colors pb-1"
                                            placeholder="Nome do Modelo"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        {selectedModelId && (
                                            <button
                                                onClick={() => handleDelete(selectedModelId)}
                                                className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                                                title="Excluir Modelo"
                                            >
                                                <span className="material-symbols-outlined">delete</span>
                                            </button>
                                        )}
                                        <button
                                            onClick={handleSave}
                                            className="btn-primary flex items-center gap-2 px-6 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition-colors shadow-lg shadow-emerald-500/20"
                                        >
                                            <span className="material-symbols-outlined">save</span>
                                            Salvar Alterações
                                        </button>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-8">
                                    <div className="flex-1 min-w-[300px]">
                                        <label className="text-xs font-bold text-slate-400 uppercase mb-2 block bg-rose-400/20 text-rose-300 inline-block px-2 py-0.5 rounded">
                                            ESTABELECIMENTO / DESCRIÇÃO
                                        </label>
                                        <textarea
                                            value={formData.description}
                                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                                            rows={2}
                                            className="w-full bg-background-dark border border-white/10 rounded-lg p-3 text-sm text-white resize-none focus:border-emerald-500 outline-none"
                                            placeholder="Descrição do modelo..."
                                        />
                                    </div>
                                    <div className="flex gap-8 items-end">
                                        <div>
                                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Total</label>
                                            <div className="text-3xl font-bold text-emerald-400">
                                                {currentTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Valor Total do Editável</label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={formData.labor_price}
                                                onChange={e => setFormData({ ...formData, labor_price: parseFloat(e.target.value) || 0 })}
                                                className="bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-xl font-bold text-white w-40 text-right focus:border-emerald-500 outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* PRODUCTS LIST (CARRINHO) */}
                            <div className="flex-1 overflow-hidden flex flex-col p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                        Carrinho
                                        <span className="bg-white/10 text-xs px-2 py-1 rounded-full text-slate-300 h-6 flex items-center justify-center min-w-[1.5rem]">
                                            {formData.items.length}
                                        </span>
                                    </h3>

                                    <div className="relative">
                                        <button
                                            onClick={() => setIsProductSearchOpen(!isProductSearchOpen)}
                                            className="text-emerald-500 font-bold hover:text-emerald-400 flex items-center gap-1 text-sm bg-emerald-500/10 px-3 py-2 rounded-lg hover:bg-emerald-500/20 transition-all border border-emerald-500/20"
                                        >
                                            <span className="material-symbols-outlined text-lg">add_shopping_cart</span>
                                            Adicionar Produto
                                        </button>

                                        {isProductSearchOpen && (
                                            <div className="absolute right-0 top-full mt-2 w-80 bg-surface-dark border border-white/10 rounded-xl shadow-2xl z-50 p-3">
                                                <input
                                                    type="text"
                                                    placeholder="Buscar produto..."
                                                    className="w-full bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm mb-2 focus:border-emerald-500 outline-none"
                                                    autoFocus
                                                    value={productSearchTerm}
                                                    onChange={e => setProductSearchTerm(e.target.value)}
                                                />
                                                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                                    {availableProducts.map(p => (
                                                        <button
                                                            key={p.id}
                                                            onClick={() => handleAddItem(p)}
                                                            className="w-full text-left px-3 py-2 hover:bg-white/5 rounded-lg text-sm flex justify-between items-center group"
                                                        >
                                                            <span className="truncate flex-1 pr-2 text-slate-300">{p.name}</span>
                                                            <span className="text-emerald-500 text-xs font-mono whitespace-nowrap">
                                                                {p.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex-1 overflow-auto bg-surface-dark border border-white/5 rounded-xl shadow-inner scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-black/20 text-slate-400 font-bold uppercase text-xs sticky top-0 z-10 backdrop-blur-sm">
                                            <tr>
                                                <th className="px-6 py-4">Produto</th>
                                                <th className="px-6 py-4 text-center w-32">Quantidade</th>
                                                <th className="px-6 py-4 text-right w-40">Preço Unit.</th>
                                                <th className="px-6 py-4 text-right w-40">Total</th>
                                                <th className="px-6 py-4 w-12"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {formData.items.map((item, idx) => (
                                                <tr key={`${item.product_id}-${idx}`} className="hover:bg-white/5 transition-colors group">
                                                    <td className="px-6 py-4">
                                                        <span className="font-bold text-slate-200 block text-sm">{item.product?.name}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center justify-center">
                                                            <input
                                                                type="number"
                                                                min="0.1"
                                                                step="0.1"
                                                                className="w-20 bg-background-dark border border-white/10 rounded px-2 py-1 text-center text-white outline-none focus:border-emerald-500 font-mono text-sm"
                                                                value={item.quantity}
                                                                onChange={(e) => handleUpdateItemQuantity(idx, parseFloat(e.target.value) || 0)}
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <span className="text-rose-400 font-mono font-bold text-sm">
                                                            {item.product?.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <span className="text-emerald-400 font-mono font-bold text-sm">
                                                            {((item.product?.price || 0) * item.quantity).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <button
                                                            onClick={() => handleRemoveItem(idx)}
                                                            className="text-slate-600 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                                                        >
                                                            <span className="material-symbols-outlined text-[20px]">delete</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {formData.items.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500 italic">
                                                        Selecione produtos para adicionar ao modelo.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                        {formData.name.toLowerCase().includes('placa') && formData.items.length > 0 && (
                                            <tfoot className="bg-emerald-500/5 border-t border-white/10">
                                                <tr className="font-bold text-white">
                                                    <td className="px-6 py-4 text-emerald-400">TOTAL DE COMPONENTES</td>
                                                    <td className="px-6 py-4 text-center text-emerald-400 font-mono text-lg">
                                                        {formData.items.reduce((sum, item) => sum + item.quantity, 0).toLocaleString('pt-BR')}
                                                    </td>
                                                    <td colSpan={3}></td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col justify-center items-center text-slate-500 p-8">
                            <span className="material-symbols-outlined text-6xl mb-4 opacity-50">design_services</span>
                            <h3 className="text-xl font-bold text-slate-400 mb-2">Nenhum modelo selecionado</h3>
                            <p className="max-w-md text-center opacity-70">
                                Selecione um modelo na lista à esquerda para editar ou crie um novo modelo para começar.
                            </p>
                            <button
                                onClick={handleCreateNew}
                                className="mt-6 btn-primary px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition-all shadow-lg shadow-emerald-500/10"
                            >
                                Criar Novo Modelo
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ServiceModelsView;

