import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from './PageHeader';
import { Supplier, Product, SupplierPurchase } from '../types';

const SuppliersView: React.FC = () => {
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

    // Purchase Entry State
    const [entryForm, setEntryForm] = useState({
        supplier_id: '',
        product_id: '',
        quantity: 0,
        unit_cost: 0,
        notes: '',
        purchase_date: new Date().toISOString().split('T')[0]
    });

    useEffect(() => {
        fetchSuppliers();
        fetchProducts();
        if (activeTab === 'report') fetchPurchases();
    }, [activeTab]);

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

    // --- Purchase Entry ---
    const handleSaveEntry = async () => {
        if (!entryForm.supplier_id || !entryForm.product_id || entryForm.quantity <= 0) {
            return alert('Preencha os campos obrigatórios corretamente.');
        }

        const { error } = await supabase.from('supplier_purchases').insert({
            supplier_id: entryForm.supplier_id,
            product_id: entryForm.product_id,
            quantity: entryForm.quantity,
            unit_cost: entryForm.unit_cost,
            notes: entryForm.notes,
            purchase_date: entryForm.purchase_date
        });

        if (error) {
            alert('Erro ao lançar compra: ' + error.message);
        } else {
            alert('Compra registrada com sucesso!');
            setEntryForm({ ...entryForm, quantity: 0, unit_cost: 0, notes: '' });
            setActiveTab('report'); // Determine flow
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

            <main className="flex-1 overflow-y-auto p-8">
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

                {activeTab === 'entry' && (
                    <div className="max-w-2xl mx-auto bg-surface-dark border border-white/5 rounded-xl p-8">
                        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <span className="material-symbols-outlined text-emerald-500">shopping_cart_checkout</span>
                            Lançamento Rápido
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="md:col-span-2">
                                <label className="block text-slate-400 text-sm font-bold mb-2">Fornecedor</label>
                                <select
                                    className="w-full bg-background-dark border border-white/10 rounded-lg p-3 text-white outline-none focus:border-emerald-500"
                                    value={entryForm.supplier_id}
                                    onChange={(e) => setEntryForm({ ...entryForm, supplier_id: e.target.value })}
                                >
                                    <option value="">Selecione...</option>
                                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-slate-400 text-sm font-bold mb-2">Produto</label>
                                <select
                                    className="w-full bg-background-dark border border-white/10 rounded-lg p-3 text-white outline-none focus:border-emerald-500"
                                    value={entryForm.product_id}
                                    onChange={(e) => {
                                        const prod = products.find(p => p.id === e.target.value);
                                        setEntryForm({ ...entryForm, product_id: e.target.value, unit_cost: prod?.price || 0 });
                                    }}
                                >
                                    <option value="">Selecione do Catálogo...</option>
                                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-slate-400 text-sm font-bold mb-2">Data da Compra</label>
                                <input
                                    type="date"
                                    className="w-full bg-background-dark border border-white/10 rounded-lg p-3 text-white outline-none focus:border-emerald-500"
                                    value={entryForm.purchase_date}
                                    onChange={(e) => setEntryForm({ ...entryForm, purchase_date: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-slate-400 text-sm font-bold mb-2">Quantidade</label>
                                <input
                                    type="number"
                                    className="w-full bg-background-dark border border-white/10 rounded-lg p-3 text-white outline-none focus:border-emerald-500"
                                    value={entryForm.quantity}
                                    onChange={(e) => setEntryForm({ ...entryForm, quantity: Number(e.target.value) })}
                                />
                            </div>

                            <div>
                                <label className="block text-slate-400 text-sm font-bold mb-2">Custo Unitário (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="w-full bg-background-dark border border-white/10 rounded-lg p-3 text-white outline-none focus:border-emerald-500"
                                    value={entryForm.unit_cost}
                                    onChange={(e) => setEntryForm({ ...entryForm, unit_cost: Number(e.target.value) })}
                                />
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-slate-400 text-sm font-bold mb-2">Observações</label>
                                <textarea
                                    className="w-full bg-background-dark border border-white/10 rounded-lg p-3 text-white outline-none focus:border-emerald-500 h-24 resize-none"
                                    value={entryForm.notes}
                                    onChange={(e) => setEntryForm({ ...entryForm, notes: e.target.value })}
                                />
                            </div>

                            <div className="md:col-span-2 flex justify-end">
                                <button onClick={handleSaveEntry} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-8 rounded-lg transition-colors shadow-lg shadow-emerald-500/20">
                                    Registrar Compra
                                </button>
                            </div>
                        </div>
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
