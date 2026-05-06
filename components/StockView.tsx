import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Product } from '../types';
import PageHeader from './PageHeader';
import ProductFormModal from './ProductFormModal';

const StockView: React.FC = () => {
    const { user } = useAuth();
    const [products, setProducts] = useState<Product[]>([]);
    const [stockMovements, setStockMovements] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'GRID' | 'LIST'>('GRID');

    // Modals
    const [isStockModalOpen, setIsStockModalOpen] = useState(false);
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [stockModalAction, setStockModalAction] = useState<'IN' | 'OUT' | 'ADJUST'>('IN');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [quantity, setQuantity] = useState<number>(0);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        // Fetch only products (excluding signage if they are handled elsewhere, or all if preferred)
        // Given the request "semelhante ao de placas para os outros produtos", I'll show non-signage products here
        const { data: productsData } = await supabase
            .from('product_catalog')
            .select('*')
            .eq('is_signage', false)
            .order('name');

        const { data: stockData } = await supabase.from('product_stock').select('*');

        if (productsData) setProducts(productsData);
        if (stockData) setStockMovements(stockData);
        setLoading(false);
    };

    const computeQuantity = (productId: string) => {
        const movements = stockMovements.filter((s) => s.product_id === productId);
        return movements.reduce((sum, m) => {
            if (m.movement_type === 'IN') return sum + m.quantity;
            if (m.movement_type === 'OUT') return sum - m.quantity;
            if (m.movement_type === 'ADJUST') return m.quantity;
            return sum;
        }, 0);
    };

    const openStockModal = (product: Product, action: 'IN' | 'OUT' | 'ADJUST') => {
        setSelectedProduct(product);
        setStockModalAction(action);
        setQuantity(0);
        setIsStockModalOpen(true);
    };

    const handleStockSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProduct) return;

        if (stockModalAction === 'OUT') {
            const currentQty = computeQuantity(selectedProduct.id);
            if (quantity > currentQty) {
                alert('Quantidade de saída maior que o estoque disponível.');
                return;
            }
        }

        const { error } = await supabase.from('product_stock').insert([{
            product_id: selectedProduct.id,
            movement_type: stockModalAction,
            quantity: quantity,
            user_id: user?.id
        }]);

        if (error) {
            alert('Erro ao registrar movimentação: ' + error.message);
        } else {
            setIsStockModalOpen(false);
            fetchData();
        }
    };

    const filteredProducts = products.filter((p) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.storage_location?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.observation?.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <PageHeader
                title="Controle de Depósito"
                subtitle="Gestão visual e controle de estoque do catálogo de produtos."
                actions={
                    <div className="flex gap-2">
                        <button
                            onClick={() => setIsProductModalOpen(true)}
                            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary hover:bg-primary-dark text-white transition-all font-bold text-sm shadow-lg shadow-primary/20"
                        >
                            <span className="material-symbols-outlined text-[18px]">add_circle</span>
                            Novo Produto
                        </button>
                        <button
                            onClick={() => setViewMode(viewMode === 'GRID' ? 'LIST' : 'GRID')}
                            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-surface-dark border border-white/10 text-white hover:bg-white/5 transition-all font-bold text-sm"
                        >
                            <span className="material-symbols-outlined text-[18px]">
                                {viewMode === 'GRID' ? 'format_list_bulleted' : 'grid_view'}
                            </span>
                            {viewMode === 'GRID' ? 'Ver em Lista' : 'Ver em Grade'}
                        </button>
                    </div>
                }
            />

            <div className="px-8 py-4 border-b border-white/10 flex gap-4 items-center">
                <div className="relative max-w-md w-full">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[20px]">search</span>
                    <input
                        type="text"
                        placeholder="Buscar por nome, localização ou detalhe..."
                        className="w-full bg-surface-dark border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white outline-none focus:border-primary transition-all shadow-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="text-slate-500 text-sm">
                    {filteredProducts.length} produtos encontrados
                </div>
            </div>

            <main className="flex-1 overflow-auto p-4 md:p-6">
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    </div>
                ) : viewMode === 'GRID' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredProducts.map((product) => {
                            const currentQty = computeQuantity(product.id);
                            return (
                                <div key={product.id} className="bg-surface-dark border border-white/10 rounded-2xl overflow-hidden shadow-lg hover:border-primary/50 transition-all group flex flex-col">
                                    <div className="aspect-square bg-white/5 relative overflow-hidden flex items-center justify-center p-4">
                                        {product.image ? (
                                            <img src={product.image} alt={product.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                        ) : (
                                            <span className="material-symbols-outlined text-6xl text-slate-700">inventory_2</span>
                                        )}
                                        <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                                            <span className={`text-xs font-bold ${currentQty > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                Qtd: {currentQty}
                                            </span>
                                        </div>
                                        {product.storage_location && (
                                            <div className="absolute bottom-3 left-3 bg-primary/20 backdrop-blur-md px-3 py-1 rounded-full border border-primary/30">
                                                <span className="text-[10px] uppercase font-black text-primary flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[12px]">location_on</span>
                                                    {product.storage_location}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-5 flex flex-col flex-1">
                                        <h3 className="font-bold text-white mb-1 truncate" title={product.name}>{product.name}</h3>
                                        <p className="text-xs text-slate-500 mb-4 line-clamp-1">{product.category || 'Material'}</p>

                                        <div className="mt-auto grid grid-cols-4 gap-2">
                                            <button
                                                onClick={() => openStockModal(product, 'IN')}
                                                className="flex flex-col items-center justify-center py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 rounded-xl transition-all border border-emerald-500/20"
                                                title="Entrada"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">add_circle</span>
                                                <span className="text-[9px] font-bold mt-1">ENTRADA</span>
                                            </button>
                                            <button
                                                onClick={() => openStockModal(product, 'OUT')}
                                                className="flex flex-col items-center justify-center py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-xl transition-all border border-rose-500/20"
                                                title="Saída"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">remove_circle</span>
                                                <span className="text-[9px] font-bold mt-1">SAÍDA</span>
                                            </button>
                                            <button
                                                onClick={() => openStockModal(product, 'ADJUST')}
                                                className="flex flex-col items-center justify-center py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-xl transition-all border border-amber-500/20"
                                                title="Ajuste"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">tune</span>
                                                <span className="text-[9px] font-bold mt-1">AJUSTE</span>
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setSelectedProduct(product);
                                                    setIsProductModalOpen(true);
                                                }}
                                                className="flex flex-col items-center justify-center py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded-xl transition-all border border-blue-500/20"
                                                title="Editar Produto"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">edit</span>
                                                <span className="text-[9px] font-bold mt-1">EDITAR</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="bg-surface-dark border border-white/10 rounded-2xl overflow-hidden shadow-lg">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left min-w-[800px]">
                                <thead className="bg-white/5 border-b border-white/10 font-bold text-xs uppercase text-slate-400">
                                    <tr>
                                        <th className="px-6 py-4">Ações</th>
                                        <th className="px-6 py-4">Produto</th>
                                        <th className="px-6 py-4">Categoria</th>
                                        <th className="px-6 py-4">Localização</th>
                                        <th className="px-6 py-4 text-center">Estoque</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredProducts.map((product) => (
                                        <tr key={product.id} className="hover:bg-white/5 transition-colors group">
                                            <td className="px-6 py-4 text-left">
                                                <div className="flex justify-start gap-2">
                                                    <button onClick={() => openStockModal(product, 'IN')} className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 rounded-lg transition-all" title="Entrada"><span className="material-symbols-outlined text-[18px]">add</span></button>
                                                    <button onClick={() => openStockModal(product, 'OUT')} className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-lg transition-all" title="Saída"><span className="material-symbols-outlined text-[18px]">remove</span></button>
                                                    <button onClick={() => openStockModal(product, 'ADJUST')} className="p-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-lg transition-all" title="Ajuste"><span className="material-symbols-outlined text-[18px]">tune</span></button>
                                                    <button onClick={() => {
                                                        setSelectedProduct(product);
                                                        setIsProductModalOpen(true);
                                                    }} className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded-lg transition-all" title="Editar Produto"><span className="material-symbols-outlined text-[18px]">edit</span></button>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center overflow-hidden border border-white/10 shrink-0">
                                                    {product.image ? (
                                                        <img src={product.image} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="material-symbols-outlined text-slate-600">inventory_2</span>
                                                    )}
                                                </div>
                                                <span className="font-bold text-white">{product.name}</span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-400">{product.category}</td>
                                            <td className="px-6 py-4">
                                                {product.storage_location ? (
                                                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded font-bold uppercase tracking-wider">{product.storage_location}</span>
                                                ) : (
                                                    <span className="text-slate-600">-</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`font-mono font-bold ${computeQuantity(product.id) > 0 ? 'text-emerald-500' : 'text-slate-500'}`}>
                                                    {computeQuantity(product.id)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>

            {/* Modal de Movimentação */}
            {isStockModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4 overflow-y-auto">
                    <div className="bg-surface-dark border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 my-auto max-h-[95vh] overflow-y-auto custom-scrollbar">
                        <div className="flex items-center gap-3 mb-6">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stockModalAction === 'IN' ? 'bg-emerald-500/20 text-emerald-500' :
                                stockModalAction === 'OUT' ? 'bg-rose-500/20 text-rose-500' : 'bg-amber-500/20 text-amber-500'
                                }`}>
                                <span className="material-symbols-outlined text-[28px]">
                                    {stockModalAction === 'IN' ? 'add_circle' : stockModalAction === 'OUT' ? 'remove_circle' : 'tune'}
                                </span>
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">Movimentação</h2>
                                <p className="text-sm text-slate-400 capitalize">{stockModalAction === 'IN' ? 'Entrada no estoque' : stockModalAction === 'OUT' ? 'Saída do estoque' : 'Ajuste de estoque'}</p>
                            </div>
                        </div>

                        <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/5">
                            <p className="text-xs text-slate-500 uppercase font-bold mb-1">Produto Selecionado</p>
                            <p className="font-bold text-white">{selectedProduct?.name}</p>
                            <div className="mt-2 flex items-center gap-2">
                                <span className="text-[10px] bg-white/10 text-slate-400 px-2 py-0.5 rounded uppercase">{selectedProduct?.category}</span>
                                <span className="text-[10px] text-slate-500 font-bold">Estoque atual: {computeQuantity(selectedProduct?.id || '')}</span>
                            </div>
                        </div>

                        <form onSubmit={handleStockSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Quantidade</label>
                                <input
                                    type="number"
                                    required
                                    min="0"
                                    step="0.01"
                                    autoFocus
                                    value={quantity}
                                    onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all text-center text-2xl font-mono"
                                />
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsStockModalOpen(false)}
                                    className="flex-1 py-3 border border-white/10 rounded-xl text-slate-300 font-bold hover:bg-white/5 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className={`flex-1 py-3 rounded-xl text-white font-bold shadow-lg transition-all ${stockModalAction === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20' :
                                        stockModalAction === 'OUT' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20' : 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/20'
                                        }`}
                                >
                                    Confirmar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <ProductFormModal
                isOpen={isProductModalOpen}
                onClose={() => {
                    setIsProductModalOpen(false);
                    setSelectedProduct(null); // Reset selection
                }}
                onSuccess={() => {
                    fetchData();
                    setIsProductModalOpen(false);
                    setSelectedProduct(null); // Reset selection
                }}
                productToEdit={selectedProduct} // Pass the selected product for editing
            />

        </div>
    );
};

export default StockView;
