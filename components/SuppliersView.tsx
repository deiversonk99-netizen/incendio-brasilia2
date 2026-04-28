import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from './PageHeader';
import { Supplier, Product, SupplierPurchase } from '../types';

const SuppliersView: React.FC = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'list' | 'entry' | 'report'>('list');
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [purchases, setPurchases] = useState<SupplierPurchase[]>([]);
    const [loading, setLoading] = useState(false);

    // Filter/Search
    const [searchTerm, setSearchTerm] = useState('');

    // Supplier Form State
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
    const [supplierForm, setSupplierForm] = useState<Partial<Supplier>>({ name: '', contact_name: '', email: '', phone: '', tax_id: '' });

    // Bulk Grid Entry State
    const [batchHeader, setBatchHeader] = useState({
        supplier_id: '',
        purchase_date: new Date().toISOString().split('T')[0],
        notes: ''
    });

    // Map: productId -> { quantity, unit_cost, checked }
    const [entryGrid, setEntryGrid] = useState<Record<string, { quantity: number, unit_cost: number, checked: boolean }>>({});

    // Quick Add Product State
    const [isAddProductOpen, setIsAddProductOpen] = useState(false);
    const [quickProduct, setQuickProduct] = useState({ name: '', unit: 'un', price: 0 });
    const [productFilter, setProductFilter] = useState('');

    // Wizard Step State
    const [purchaseStep, setPurchaseStep] = useState<'context' | 'items'>('context');

    useEffect(() => {
        fetchSuppliers();
        fetchProducts();
    }, []);

    useEffect(() => {
        if (activeTab === 'report') fetchPurchases();
    }, [activeTab]);

    const handleNextStep = () => {
        if (!batchHeader.supplier_id) return alert('Selecione o fornecedor para continuar.');
        setPurchaseStep('items');
    };

    const fetchSuppliers = async () => {
        setLoading(true);
        const { data } = await supabase.from('suppliers').select('*').order('name');
        if (data) setSuppliers(data);
        setLoading(false);
    };

    const fetchProducts = async () => {
        const { data } = await supabase.from('product_catalog').select('*').order('name');
        if (data) setProducts(data);
    };

    const fetchPurchases = async () => {
        setLoading(true);
        // Using raw queries or simple select with join hint if possible, but TS types need manual mapping
        const { data, error } = await supabase
            .from('supplier_purchases')
            .select('*, products:product_catalog(name, unit)')
            .order('purchase_date', { ascending: false });

        if (data) setPurchases(data as any);
        if (error) console.error(error);
        setLoading(false);
    };

    // --- Supplier CRUD ---
    const handleSaveSupplier = async () => {
        if (!supplierForm.name) return alert('Nome é obrigatório');

        if (editingSupplier) {
            await supabase.from('suppliers').update(supplierForm).eq('id', editingSupplier.id);
        } else {
            await supabase.from('suppliers').insert(supplierForm);
        }
        setIsSupplierModalOpen(false);
        fetchSuppliers();
        setEditingSupplier(null);
        setSupplierForm({ name: '', contact_name: '', email: '', phone: '', tax_id: '' });
    };

    const handleEditSupplier = (s: Supplier) => {
        setEditingSupplier(s);
        setSupplierForm(s);
        setIsSupplierModalOpen(true);
    };

    const handleDeleteSupplier = async (id: string) => {
        if (!confirm('Deseja excluir este fornecedor?')) return;
        await supabase.from('suppliers').delete().eq('id', id);
        fetchSuppliers();
    };

    // --- Bulk Entry Logic ---
    const handleGridChange = (productId: string, field: 'quantity' | 'unit_cost', value: number) => {
        setEntryGrid(prev => {
            const current = prev[productId] || { quantity: 0, unit_cost: 0, checked: false };
            const newData = { ...current, [field]: value };

            // Auto-check if quantity > 0
            if (field === 'quantity' && value > 0) newData.checked = true;

            return { ...prev, [productId]: newData };
        });
    };

    const toggleProductCheck = (productId: string) => {
        setEntryGrid(prev => {
            const current = prev[productId] || { quantity: 0, unit_cost: products.find(p => p.id === productId)?.price || 0, checked: false };
            return { ...prev, [productId]: { ...current, checked: !current.checked } };
        });
    };

    const handleCreateProduct = async () => {
        if (!quickProduct.name) return alert('Nome do produto é obrigatório.');

        setLoading(true);
        const { data, error } = await supabase.from('product_catalog').insert({
            name: quickProduct.name,
            unit: quickProduct.unit,
            price: quickProduct.price,
            supplier_id: batchHeader.supplier_id || null // Link to current supplier if selected
        }).select();

        if (error) {
            alert('Erro ao criar produto: ' + error.message);
        } else if (data) {
            await fetchProducts(); // Refresh list
            setIsAddProductOpen(false);
            setQuickProduct({ name: '', unit: 'un', price: 0 });

            // Optionally auto-select the new product in the grid
            const newId = data[0].id;
            setEntryGrid(prev => ({
                ...prev,
                [newId]: { quantity: 0, unit_cost: quickProduct.price, checked: true }
            }));
        }
        setLoading(false);
    };

    const handleSaveBulk = async () => {
        if (!batchHeader.supplier_id) return alert('Selecione o fornecedor.');
        if (!user) return alert('Usuário não autenticado.');

        const selectedItems = Object.entries(entryGrid)
            .filter(([_, data]: [string, any]) => data.checked && data.quantity > 0);

        if (selectedItems.length === 0) return alert('Nenhum item selecionado com quantidade válida.');

        const itemsToSave = selectedItems.map(([productId, data]: [string, any]) => ({
            supplier_id: batchHeader.supplier_id,
            purchase_date: batchHeader.purchase_date,
            notes: batchHeader.notes,
            product_id: productId,
            quantity: data.quantity,
            unit_cost: data.unit_cost
        }));

        if (!confirm(`Confirma o lançamento de ${itemsToSave.length} itens?`)) return;

        setLoading(true);
        try {
            // 1. Insert into supplier_purchases
            const { error: purchaseError } = await supabase.from('supplier_purchases').insert(itemsToSave);
            if (purchaseError) throw purchaseError;

            // 2. Insert into stock_movements (Entry)
            const stockMovements = selectedItems.map(([productId, data]: [string, any]) => ({
                product_id: productId,
                quantity: data.quantity,
                type: 'PURCHASE',
                notes: `Compra de ${suppliers.find(s => s.id === batchHeader.supplier_id)?.name} - ${batchHeader.notes}`,
                user_id: user.id
            }));

            const { error: stockError } = await supabase.from('stock_movements').insert(stockMovements);
            if (stockError) throw stockError;

            alert('Compras e estoque registrados com sucesso!');
            setEntryGrid({});
            setBatchHeader({ ...batchHeader, notes: '' });
            setActiveTab('report');
        } catch (error: any) {
            console.error('Error saving bulk purchase:', error);
            alert('Erro ao salvar compras e estoque: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // --- Render Helpers ---

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <PageHeader
                title="Gestão de Fornecedores"
                subtitle="Cadastre fornecedores, lance compras e acompanhe relatórios."
                breadcrumbs={
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-text-muted">Home</span>
                        <span className="material-symbols-outlined text-text-muted text-[14px]">chevron_right</span>
                        <span className="text-primary font-semibold">Fornecedores</span>
                    </div>
                }
                actions={
                    activeTab === 'list' && (
                        <button onClick={() => { setEditingSupplier(null); setSupplierForm({}); setIsSupplierModalOpen(true); }} className="btn-primary flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition-colors">
                            <span className="material-symbols-outlined text-[18px]">add</span>
                            Novo Fornecedor
                        </button>
                    )
                }
            />

            {/* Tabs */}
            <div className="border-b border-white/10 px-8 flex gap-6">
                <button onClick={() => setActiveTab('list')} className={`py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'list' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-white'}`}>
                    Listagem
                </button>
                <button onClick={() => setActiveTab('entry')} className={`py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'entry' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-white'}`}>
                    Lançamento de Compras
                </button>
                <button onClick={() => setActiveTab('report')} className={`py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'report' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-white'}`}>
                    Relatório de Insumos
                </button>
            </div>

            <main className={`flex-1 ${activeTab === 'entry' && purchaseStep === 'items' ? 'overflow-hidden flex flex-col p-4' : 'overflow-y-auto p-8'}`}>
                {activeTab === 'list' && (
                    <div className="max-w-7xl mx-auto">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {suppliers.map(s => (
                                <div key={s.id} className="bg-surface-dark border border-white/5 rounded-xl p-6 group hover:border-emerald-500/30 transition-all">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="h-10 w-10 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-500 font-bold text-lg uppercase">
                                            {s.name.substring(0, 2)}
                                        </div>
                                        <div className="opacity-0 group-hover:opacity-100 flex gap-2 transition-opacity">
                                            <button onClick={() => handleEditSupplier(s)} className="p-1 hover:bg-white/10 rounded text-amber-400"><span className="material-symbols-outlined text-lg">edit</span></button>
                                            <button onClick={() => handleDeleteSupplier(s.id)} className="p-1 hover:bg-white/10 rounded text-rose-400"><span className="material-symbols-outlined text-lg">delete</span></button>
                                        </div>
                                    </div>
                                    <h3 className="text-white font-bold text-lg mb-1">{s.name}</h3>
                                    <div className="space-y-1 text-sm text-slate-400">
                                        <div className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px]">person</span> {s.contact_name || '-'}</div>
                                        <div className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px]">mail</span> {s.email || '-'}</div>
                                        <div className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px]">call</span> {s.phone || '-'}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'entry' && purchaseStep === 'context' && (
                    <div className="max-w-2xl mx-auto py-6 w-full flex-1">
                        <div className="bg-surface-dark border border-white/5 rounded-2xl p-6 shadow-2xl">
                            <div className="text-center mb-6">
                                <div className="h-12 w-12 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <span className="material-symbols-outlined text-emerald-500 text-2xl">post_add</span>
                                </div>
                                <h2 className="text-xl font-bold text-white">Novo Lançamento de Compra</h2>
                                <p className="text-slate-400 mt-1 text-sm">Defina os dados da nota para começar a lançar os itens.</p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-300 mb-2 uppercase tracking-wider">Fornecedor</label>
                                    <select
                                        className="w-full bg-background-dark border border-white/10 rounded-xl p-4 text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-lg"
                                        value={batchHeader.supplier_id}
                                        onChange={(e) => setBatchHeader({ ...batchHeader, supplier_id: e.target.value })}
                                        autoFocus
                                    >
                                        <option value="">Selecione o Fornecedor...</option>
                                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-300 mb-1 uppercase tracking-wider">Data da Compra</label>
                                        <input
                                            type="date"
                                            className="w-full bg-background-dark border border-white/10 rounded-xl p-3 text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-sm"
                                            value={batchHeader.purchase_date}
                                            onChange={(e) => setBatchHeader({ ...batchHeader, purchase_date: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-300 mb-1 uppercase tracking-wider">Observações / NF</label>
                                        <input
                                            type="text"
                                            placeholder="Ex: NF-e 123456"
                                            className="w-full bg-background-dark border border-white/10 rounded-xl p-3 text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-sm"
                                            value={batchHeader.notes}
                                            onChange={(e) => setBatchHeader({ ...batchHeader, notes: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <button
                                    onClick={handleNextStep}
                                    disabled={!batchHeader.supplier_id}
                                    className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all transform hover:scale-[1.02] flex items-center justify-center gap-3"
                                >
                                    <span>Selecionar Produtos</span>
                                    <span className="material-symbols-outlined">arrow_forward</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'entry' && purchaseStep === 'items' && (
                    <div className="max-w-7xl mx-auto flex flex-col gap-4 h-full w-full">
                        {/* Compact Context Bar */}
                        <div className="bg-surface-dark border border-white/5 rounded-xl p-4 flex justify-between items-center shrink-0 shadow-md">
                            <div className="flex items-center gap-6">
                                <button onClick={() => setPurchaseStep('context')} className="h-10 w-10 bg-white/5 rounded-lg flex items-center justify-center hover:bg-white/10 text-slate-400 hover:text-white transition-colors" title="Voltar">
                                    <span className="material-symbols-outlined">arrow_back</span>
                                </button>
                                <div>
                                    <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">Editando Lançamento</div>
                                    <div className="text-white font-medium flex items-center gap-2">
                                        <span className="material-symbols-outlined text-emerald-500 text-lg">store</span>
                                        {suppliers.find(s => s.id === batchHeader.supplier_id)?.name}
                                        <span className="text-slate-600 mx-1">|</span>
                                        <span className="text-slate-300">{new Date(batchHeader.purchase_date).toLocaleDateString()}</span>
                                        {batchHeader.notes && <span className="text-slate-500 text-sm italic ml-2">- {batchHeader.notes}</span>}
                                    </div>
                                </div>
                            </div>
                            <div className="hidden md:flex items-center gap-6 text-sm text-slate-400">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-emerald-500">check_box</span>
                                    Clique ou Digite Qtd
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-emerald-500">search</span>
                                    Filtre Rápido
                                </div>
                            </div>
                        </div>

                        {/* Bulk Grid */}
                        <div className="bg-surface-dark border border-white/5 rounded-xl flex-1 flex flex-col min-h-0 overflow-hidden shadow-2xl relative">
                            <div className="p-4 border-b border-white/5 flex gap-4 items-center justify-between bg-black/20">
                                <div className="relative flex-1 max-w-md">
                                    <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-500">search</span>
                                    <input
                                        type="text"
                                        placeholder="Filtrar produtos..."
                                        className="w-full bg-background-dark border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white outline-none focus:border-emerald-500"
                                        value={productFilter}
                                        onChange={(e) => setProductFilter(e.target.value)}
                                    />
                                </div>
                                <button
                                    onClick={() => setIsAddProductOpen(true)}
                                    className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-sm font-bold flex items-center gap-2 border border-emerald-500/20"
                                >
                                    <span className="material-symbols-outlined text-[18px]">add_circle</span>
                                    Novo Produto
                                </button>
                            </div>

                            <div className="flex-1 overflow-auto">
                                <table className="w-full text-left text-sm relative border-collapse">
                                    <thead className="bg-background-dark text-slate-400 font-bold uppercase text-xs sticky top-0 z-10 shadow-md">
                                        <tr>
                                            <th className="px-6 py-3 w-12 text-center">
                                                <span className="material-symbols-outlined text-[18px]">check_box</span>
                                            </th>
                                            <th className="px-6 py-3">Produto</th>
                                            <th className="px-6 py-3 w-32">Unidade</th>
                                            <th className="px-6 py-3 w-40">Quantidade</th>
                                            <th className="px-6 py-3 w-40">Custo (R$)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {products.filter(p => !productFilter || p.name.toLowerCase().includes(productFilter.toLowerCase())).map(product => {
                                            const state = entryGrid[product.id] || { quantity: 0, unit_cost: product.price, checked: false };
                                            return (
                                                <tr key={product.id} className={`transition-colors ${state.checked ? 'bg-emerald-900/10' : 'hover:bg-white/5'}`}>
                                                    <td className="px-6 py-3 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={state.checked}
                                                            onChange={() => toggleProductCheck(product.id)}
                                                            className="w-5 h-5 rounded border-white/20 bg-black/40 text-emerald-500 focus:ring-emerald-500 cursor-pointer accent-emerald-500"
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3 font-medium text-white">{product.name}</td>
                                                    <td className="px-6 py-3 text-slate-400 text-xs">{product.unit || 'un'}</td>
                                                    <td className="px-6 py-3">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            className={`w-full bg-black/20 border rounded px-3 py-1.5 text-white outline-none focus:border-emerald-500 transition-colors ${state.checked ? 'border-emerald-500/50' : 'border-white/10 opacity-50'}`}
                                                            value={state.quantity || ''}
                                                            // If checked, placeholder hidden, otherwise 0
                                                            placeholder={state.checked ? '' : '0'}
                                                            onChange={(e) => handleGridChange(product.id, 'quantity', Number(e.target.value))}
                                                            onFocus={() => {
                                                                // Auto check on focus if not checked
                                                                if (!state.checked) toggleProductCheck(product.id);
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            className={`w-full bg-black/20 border rounded px-3 py-1.5 text-white outline-none focus:border-emerald-500 transition-colors ${state.checked ? 'border-emerald-500/50' : 'border-white/10 opacity-50'}`}
                                                            value={state.unit_cost}
                                                            onChange={(e) => handleGridChange(product.id, 'unit_cost', Number(e.target.value))}
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {products.length === 0 && (
                                            <tr><td colSpan={5} className="p-8 text-center text-slate-500">Nenhum produto cadastrado.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="p-4 border-t border-white/10 bg-black/20 flex justify-between items-center shrink-0">
                                <div className="text-sm text-slate-400">
                                    {(Object.values(entryGrid) as any[]).filter(x => x.checked && x.quantity > 0).length} itens selecionados
                                </div>
                                <div className="flex gap-4 items-center">
                                    <div className="text-xl font-bold text-white">
                                        Total: <span className="text-emerald-400">R$ {(Object.values(entryGrid) as any[]).reduce((acc: number, curr: any) => curr.checked ? acc + (curr.quantity * curr.unit_cost) : acc, 0).toFixed(2)}</span>
                                    </div>
                                    <button
                                        onClick={handleSaveBulk}
                                        className="px-8 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                                    >
                                        <span className="material-symbols-outlined">check_circle</span>
                                        Finalizar Compra
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Quick Add Product Modal */}
                        {isAddProductOpen && (
                            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                                <div className="bg-surface-dark border border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl">
                                    <h3 className="text-lg font-bold text-white mb-4">Adicionar Novo Produto</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nome do Produto</label>
                                            <input type="text" className="w-full bg-background-dark border border-white/10 rounded px-3 py-2 text-white outline-none focus:border-emerald-500"
                                                value={quickProduct.name} onChange={e => setQuickProduct({ ...quickProduct, name: e.target.value })} autoFocus />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Unidade</label>
                                                <input type="text" className="w-full bg-background-dark border border-white/10 rounded px-3 py-2 text-white outline-none focus:border-emerald-500"
                                                    value={quickProduct.unit} onChange={e => setQuickProduct({ ...quickProduct, unit: e.target.value })} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Preço Padrão</label>
                                                <input type="number" step="0.01" className="w-full bg-background-dark border border-white/10 rounded px-3 py-2 text-white outline-none focus:border-emerald-500"
                                                    value={quickProduct.price} onChange={e => setQuickProduct({ ...quickProduct, price: Number(e.target.value) })} />
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-2 mt-2">
                                            <button onClick={() => setIsAddProductOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white">Cancelar</button>
                                            <button onClick={handleCreateProduct} className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded font-bold">Salvar e Adicionar</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'report' && (
                    <div className="max-w-7xl mx-auto">
                        <div className="bg-surface-dark border border-white/5 rounded-xl overflow-hidden">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-white/5 text-slate-400 font-bold uppercase text-xs">
                                    <tr>
                                        <th className="px-6 py-4">Data</th>
                                        <th className="px-6 py-4">Fornecedor</th>
                                        <th className="px-6 py-4">Produto</th>
                                        <th className="px-6 py-4 text-center">Qtd. Comprada</th>
                                        <th className="px-6 py-4 text-right">Custo Unit.</th>
                                        <th className="px-6 py-4 text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {purchases.map(p => {
                                        const supplier = suppliers.find(s => s.id === p.supplier_id);
                                        return (
                                            <tr key={p.id} className="hover:bg-white/5">
                                                <td className="px-6 py-4 text-slate-300">{new Date(p.purchase_date).toLocaleDateString()}</td>
                                                <td className="px-6 py-4 text-white font-medium">{supplier?.name || '---'}</td>
                                                <td className="px-6 py-4 text-white">
                                                    {(p.products as any)?.name || '---'}
                                                    <span className="text-xs text-slate-500 ml-2">({(p.products as any)?.unit})</span>
                                                </td>
                                                <td className="px-6 py-4 text-center text-emerald-400 font-bold">{p.quantity}</td>
                                                <td className="px-6 py-4 text-right text-slate-300">R$ {p.unit_cost.toFixed(2)}</td>
                                                <td className="px-6 py-4 text-right text-white font-bold">R$ {(p.quantity * p.unit_cost).toFixed(2)}</td>
                                            </tr>
                                        );
                                    })}
                                    {purchases.length === 0 && (
                                        <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">Nenhum registro encontrado.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>

            {/* Create/Edit Supplier Modal */}
            {isSupplierModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                    <div className="bg-surface-dark border border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl">
                        <h3 className="text-xl font-bold text-white mb-4">{editingSupplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h3>
                        <div className="flex flex-col gap-4">
                            <input type="text" placeholder="Nome da Empresa" className="input-field bg-background-dark border border-white/10 rounded px-4 py-3 text-white outline-none focus:border-emerald-500"
                                value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                            />
                            <input type="text" placeholder="Nome do Contato" className="input-field bg-background-dark border border-white/10 rounded px-4 py-3 text-white outline-none focus:border-emerald-500"
                                value={supplierForm.contact_name || ''} onChange={(e) => setSupplierForm({ ...supplierForm, contact_name: e.target.value })}
                            />
                            <input type="text" placeholder="Email" className="input-field bg-background-dark border border-white/10 rounded px-4 py-3 text-white outline-none focus:border-emerald-500"
                                value={supplierForm.email || ''} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                            />
                            <input type="text" placeholder="Telefone" className="input-field bg-background-dark border border-white/10 rounded px-4 py-3 text-white outline-none focus:border-emerald-500"
                                value={supplierForm.phone || ''} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                            />
                            <div className="flex justify-end gap-2 mt-4">
                                <button onClick={() => setIsSupplierModalOpen(false)} className="px-4 py-2 rounded text-slate-400 hover:text-white">Cancelar</button>
                                <button onClick={handleSaveSupplier} className="px-6 py-2 rounded bg-emerald-500 hover:bg-emerald-600 text-white font-bold">Salvar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SuppliersView;
