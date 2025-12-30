
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from './PageHeader';

const InventoryView: React.FC = () => {
    const { user } = useAuth();
    const [inventory, setInventory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    const [exitModalOpen, setExitModalOpen] = useState(false);
    const [plateModalOpen, setPlateModalOpen] = useState(false);
    const [movementModalOpen, setMovementModalOpen] = useState(false); // For manual entry/sale
    const [activeTab, setActiveTab] = useState<'stock' | 'movements'>('stock');
    const [exitData, setExitData] = useState({ quantity: 1, notes: '', type: 'MANUAL_EXIT' });
    const [plateData, setPlateData] = useState({ name: '', unit: 'un', price: 0, category: 'Placas' });
    const [suppliers, setSuppliers] = useState<any[]>([]);

    useEffect(() => {
        fetchInventory();
        fetchSuppliers();
    }, []);

    const fetchSuppliers = async () => {
        const { data } = await supabase.from('suppliers').select('id, name').order('name');
        if (data) setSuppliers(data);
    };

    const fetchInventory = async () => {
        setLoading(true);
        // Fetch products that are marked as signage
        const { data: products, error: pError } = await supabase
            .from('product_catalog')
            .select('*')
            .eq('is_signage', true)
            .order('name');

        const { data: stock, error: sError } = await supabase
            .from('stock_summary')
            .select('*');

        const { data: movements } = await supabase
            .from('stock_movements')
            .select('*, product_catalog(name)')
            .order('created_at', { ascending: false });

        if (products) {
            const combined = products.map(p => ({
                ...p,
                current_stock: stock?.find(s => s.product_id === p.id)?.current_stock || 0
            }));
            setInventory(combined);
        }

        if (movements) {
            setMovements(movements);
        }
        setLoading(false);
    };

    const [movements, setMovements] = useState<any[]>([]);

    const handleCreatePlate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const { data, error } = await supabase.from('product_catalog').insert({
            name: plateData.name,
            unit: plateData.unit,
            price: plateData.price,
            category: plateData.category,
            is_signage: true,
            user_id: user?.id
        }).select();

        if (error) {
            alert('Erro ao criar placa: ' + error.message);
        } else {
            setPlateModalOpen(false);
            setPlateData({ name: '', unit: 'un', price: 0, category: 'Placas' });
            fetchInventory();
        }
        setLoading(false);
    };

    const handleRegisterMovement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProduct || !user) return;
        setLoading(true);

        const qty = exitData.type === 'PURCHASE' ? Math.abs(exitData.quantity) : -Math.abs(exitData.quantity);

        const { error } = await supabase.from('stock_movements').insert({
            product_id: selectedProduct.id,
            quantity: qty,
            type: exitData.type,
            notes: exitData.notes,
            user_id: user.id
        });

        if (error) {
            alert('Erro ao registrar movimentação: ' + error.message);
        } else {
            setMovementModalOpen(false);
            setExitData({ quantity: 1, notes: '', type: 'MANUAL_EXIT' });
            fetchInventory();
        }
        setLoading(false);
    };

    const handleStockExit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProduct || !user) return;

        setLoading(true);
        const { error } = await supabase.from('stock_movements').insert({
            product_id: selectedProduct.id,
            quantity: -Math.abs(exitData.quantity),
            type: exitData.type,
            notes: exitData.notes,
            user_id: user.id
        });

        if (error) {
            alert('Erro ao registrar saída: ' + error.message);
        } else {
            setExitModalOpen(false);
            setExitData({ quantity: 1, notes: '', type: 'MANUAL_EXIT' });
            fetchInventory();
        }
        setLoading(false);
    };

    const filteredInventory = inventory.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => {
        // Boost items with "Placa" in the name
        const aIsPlaca = a.name.toLowerCase().includes('placa');
        const bIsPlaca = b.name.toLowerCase().includes('placa');
        if (aIsPlaca && !bIsPlaca) return -1;
        if (!aIsPlaca && bIsPlaca) return 1;
        return 0;
    });

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <PageHeader
                title="Gestão de Placas"
                subtitle="Controle total de compras, vendas e saídas de placas de sinalização."
                actions={
                    <button
                        onClick={() => setPlateModalOpen(true)}
                        className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary hover:bg-primary-dark text-white shadow-lg shadow-primary/20 transition-all font-bold text-sm"
                    >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                        Nova Placa
                    </button>
                }
            />

            {/* Tabs */}
            <div className="border-b border-white/10 px-8 flex gap-6 bg-background-dark/50 shrink-0">
                <button
                    onClick={() => setActiveTab('stock')}
                    className={`py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'stock' ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-white'}`}
                >
                    Estoque Atual
                </button>
                <button
                    onClick={() => setActiveTab('movements')}
                    className={`py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'movements' ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-white'}`}
                >
                    Histórico Buy/Sell/Exit
                </button>
            </div>

            <main className="flex-1 overflow-hidden flex flex-col p-8 bg-background-light dark:bg-background-dark">
                {activeTab === 'stock' && (
                    <>
                        <div className="flex justify-between items-center mb-6">
                            <div className="relative max-w-md w-full">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">search</span>
                                <input
                                    type="text"
                                    placeholder="Buscar placas..."
                                    className="w-full bg-surface-dark border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white outline-none focus:border-primary transition-all shadow-sm"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto bg-surface-dark border border-white/5 rounded-2xl shadow-xl">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-black/20 text-slate-400 font-bold uppercase text-xs sticky top-0 z-10 shadow-sm border-b border-white/5">
                                    <tr>
                                        <th className="px-6 py-4">Nome da Placa</th>
                                        <th className="px-6 py-4 text-center">Unidade</th>
                                        <th className="px-6 py-4 text-center">Preço Base (R$)</th>
                                        <th className="px-6 py-4 text-center">Saldo</th>
                                        <th className="px-6 py-4 w-48 text-center">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredInventory.map(item => (
                                        <tr key={item.id} className="hover:bg-white/5 transition-colors group">
                                            <td className="px-6 py-4 font-bold text-white text-sm">{item.name}</td>
                                            <td className="px-6 py-4 text-center text-slate-400 text-xs">{item.unit || 'un'}</td>
                                            <td className="px-6 py-4 text-center text-slate-300">R$ {item.price?.toFixed(2)}</td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`text-sm font-bold ${item.current_stock <= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                    {item.current_stock}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex justify-center gap-2">
                                                    <button
                                                        onClick={() => { setSelectedProduct(item); setExitData({ ...exitData, type: 'PURCHASE' }); setMovementModalOpen(true); }}
                                                        className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-all"
                                                        title="Entrada (Compra)"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span>
                                                    </button>
                                                    <button
                                                        onClick={() => { setSelectedProduct(item); setExitData({ ...exitData, type: 'SALE' }); setMovementModalOpen(true); }}
                                                        className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-all"
                                                        title="Saída (Venda)"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">shopping_cart_checkout</span>
                                                    </button>
                                                    <button
                                                        onClick={() => { setSelectedProduct(item); setExitData({ ...exitData, type: 'MANUAL_EXIT' }); setMovementModalOpen(true); }}
                                                        className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-all"
                                                        title="Saída (Manual)"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">logout</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {activeTab === 'movements' && (
                    <div className="flex-1 overflow-auto bg-surface-dark border border-white/5 rounded-2xl shadow-xl">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-black/20 text-slate-400 font-bold uppercase text-xs sticky top-0 z-10 shadow-sm border-b border-white/5">
                                <tr>
                                    <th className="px-6 py-4">Data</th>
                                    <th className="px-6 py-4">Placa</th>
                                    <th className="px-6 py-4 text-center">Tipo</th>
                                    <th className="px-6 py-4 text-center">Qtd</th>
                                    <th className="px-6 py-4">Notas</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {movements.map(mov => (
                                    <tr key={mov.id} className="hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4 text-slate-400 text-xs">{new Date(mov.created_at).toLocaleString()}</td>
                                        <td className="px-6 py-4 text-white font-medium">{mov.product_catalog?.name}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${mov.type === 'PURCHASE' ? 'bg-emerald-500/20 text-emerald-400' :
                                                    mov.type === 'SALE' ? 'bg-blue-500/20 text-blue-400' :
                                                        'bg-rose-500/20 text-rose-400'
                                                }`}>
                                                {mov.type}
                                            </span>
                                        </td>
                                        <td className={`px-6 py-4 text-center font-bold ${mov.quantity > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {mov.quantity > 0 ? `+${mov.quantity}` : mov.quantity}
                                        </td>
                                        <td className="px-6 py-4 text-slate-400 text-xs">{mov.notes || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>

            {/* Movement Modal (Combined Purchase/Sale/Exit) */}
            {movementModalOpen && selectedProduct && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                    <div className="bg-surface-dark border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl">
                        <div className="flex items-center gap-3 mb-6">
                            <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${exitData.type === 'PURCHASE' ? 'bg-emerald-500/10 text-emerald-400' :
                                    exitData.type === 'SALE' ? 'bg-blue-500/10 text-blue-400' :
                                        'bg-rose-500/10 text-rose-400'
                                }`}>
                                <span className="material-symbols-outlined text-2xl">
                                    {exitData.type === 'PURCHASE' ? 'add_shopping_cart' :
                                        exitData.type === 'SALE' ? 'shopping_cart_checkout' :
                                            'logout'}
                                </span>
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">
                                    {exitData.type === 'PURCHASE' ? 'Lançar Compra' :
                                        exitData.type === 'SALE' ? 'Lançar Venda' :
                                            'Registrar Saída'}
                                </h2>
                                <p className="text-xs text-slate-400">{selectedProduct.name}</p>
                            </div>
                        </div>

                        <form onSubmit={handleRegisterMovement} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Quantidade</label>
                                <input
                                    type="number"
                                    required
                                    min="1"
                                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary"
                                    value={exitData.quantity}
                                    onChange={e => setExitData({ ...exitData, quantity: parseInt(e.target.value) })}
                                />
                                {exitData.type !== 'PURCHASE' && (
                                    <p className="text-[10px] text-slate-500 mt-1">Saldo disponível: {selectedProduct.current_stock}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Observações / NF</label>
                                <textarea
                                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary resize-none"
                                    rows={3}
                                    placeholder="Detalhes da movimentação..."
                                    value={exitData.notes}
                                    onChange={e => setExitData({ ...exitData, notes: e.target.value })}
                                />
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => setMovementModalOpen(false)} className="flex-1 py-3 border border-white/10 rounded-xl text-slate-300 font-bold hover:bg-white/5 transition-all">
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className={`flex-1 py-3 rounded-xl text-white font-bold shadow-lg transition-all ${exitData.type === 'PURCHASE' ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20' :
                                            exitData.type === 'SALE' ? 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/20' :
                                                'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20'
                                        }`}
                                >
                                    Confirmar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* New Plate Modal */}
            {plateModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                    <div className="bg-surface-dark border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="h-12 w-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                                <span className="material-symbols-outlined text-2xl">add_box</span>
                            </div>
                            <h2 className="text-xl font-bold text-white">Cadastrar Nova Placa</h2>
                        </div>

                        <form onSubmit={handleCreatePlate} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Nome da Placa</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ex: Placa S17-1 20x30 PVC"
                                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary"
                                    value={plateData.name}
                                    onChange={e => setPlateData({ ...plateData, name: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Unidade</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary"
                                        value={plateData.unit}
                                        onChange={e => setPlateData({ ...plateData, unit: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Preço Base (R$)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        required
                                        className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary"
                                        value={plateData.price}
                                        onChange={e => setPlateData({ ...plateData, price: parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => setPlateModalOpen(false)} className="flex-1 py-3 border border-white/10 rounded-xl text-slate-300 font-bold hover:bg-white/5 transition-all">
                                    Cancelar
                                </button>
                                <button type="submit" disabled={loading} className="flex-1 py-3 bg-primary hover:bg-primary-dark rounded-xl text-white font-bold shadow-lg shadow-primary/20 transition-all">
                                    Criar Placa
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventoryView;
