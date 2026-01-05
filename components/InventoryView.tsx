import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from './PageHeader';

const InventoryView: React.FC = () => {
    const { user } = useAuth();
    const [signageItems, setSignageItems] = useState<any[]>([]);
    const [stock, setStock] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Modals
    const [isStockModalOpen, setIsStockModalOpen] = useState(false);
    const [stockModalAction, setStockModalAction] = useState<'IN' | 'OUT' | 'ADJUST'>('IN');
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [quantity, setQuantity] = useState<number>(0);

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [newImage, setNewImage] = useState<string>('');
    const [newQuantity, setNewQuantity] = useState<number>(0);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        const { data: signage, error: signageError } = await supabase
            .from('signage_catalog')
            .select('*')
            .order('name');
        const { data: stockData, error: stockError } = await supabase
            .from('signage_stock')
            .select('*');
        if (signageError) console.error('Signage fetch error', signageError);
        if (stockError) console.error('Stock fetch error', stockError);
        if (signage) setSignageItems(signage);
        if (stockData) setStock(stockData);
        setLoading(false);
    };

    const computeQuantity = (id: string) => {
        const movements = stock.filter((s) => s.signage_id === id);
        return movements.reduce((sum, m) => {
            if (m.movement_type === 'IN') return sum + m.quantity;
            if (m.movement_type === 'OUT') return sum - m.quantity;
            // ADJUST can be positive or negative
            return sum + m.quantity;
        }, 0);
    };

    // ----- Stock modal (Entrada, Saída, Ajuste) -----
    const openStockModal = (item: any, action: 'IN' | 'OUT' | 'ADJUST') => {
        setSelectedItem(item);
        setStockModalAction(action);
        setQuantity(0);
        setIsStockModalOpen(true);
    };

    const handleStockSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedItem) return;
        // Validation for Saída – cannot go negative
        if (stockModalAction === 'OUT') {
            const currentQty = computeQuantity(selectedItem.id);
            if (quantity > currentQty) {
                alert('Quantidade de saída maior que o estoque disponível.');
                return;
            }
        }
        const { error } = await supabase.from('signage_stock').insert([
            {
                signage_id: selectedItem.id,
                movement_type: stockModalAction,
                quantity: quantity,
            },
        ]);
        if (error) {
            alert('Erro ao registrar movimentação: ' + error.message);
        } else {
            fetchData();
        }
        setIsStockModalOpen(false);
    };

    // ----- Create new plate modal -----
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setNewImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleCreateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // Insert new plate into catalog
        const { data: newPlate, error: catalogError } = await supabase
            .from('signage_catalog')
            .insert([
                {
                    name: newName,
                    image: newImage,
                },
            ])
            .select();
        if (catalogError) {
            alert('Erro ao criar placa: ' + catalogError.message);
            return;
        }
        const inserted = (newPlate as any[])[0];
        // Register initial stock (IN)
        const { error: stockError } = await supabase.from('signage_stock').insert([
            {
                signage_id: inserted.id,
                movement_type: 'IN',
                quantity: newQuantity,
            },
        ]);
        if (stockError) {
            alert('Erro ao registrar estoque inicial: ' + stockError.message);
        } else {
            fetchData();
        }
        setIsCreateModalOpen(false);
        // reset fields
        setNewName('');
        setNewImage('');
        setNewQuantity(0);
    };

    const filteredItems = signageItems.filter((item) =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <PageHeader
                title="Gestão de Placas"
                subtitle="Catálogo simplificado de placas de sinalização."
                actions={
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary hover:bg-primary-dark text-white shadow-lg shadow-primary/20 transition-all font-bold text-sm"
                    >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                        Nova Placa
                    </button>
                }
            />

            <main className="flex-1 overflow-auto p-8">
                <div className="mb-6 flex items-center justify-between">
                    <div className="relative max-w-md w-full">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[20px]">search</span>
                        <input
                            type="text"
                            placeholder="Buscar por nome da placa..."
                            className="w-full bg-surface-dark border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white outline-none focus:border-primary transition-all shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={() => {
                            const rows = stock.map((s) => [s.signage_id, s.movement_type, s.quantity, new Date(s.created_at).toLocaleString()]);
                            const csv = ['Placa,Tipo,Quantidade,Data', ...rows.map(r => r.join(','))].join('\n');
                            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `relatorio_placas_${Date.now()}.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                        }}
                        className="flex items-center gap-2 h-10 px-4 rounded-lg bg-secondary hover:bg-secondary-dark text-white shadow-lg shadow-secondary/20 transition-all font-bold text-sm"
                    >
                        <span className="material-symbols-outlined text-[18px]">description</span>
                        Relatório
                    </button>
                </div>

                <table className="min-w-full bg-surface-dark text-white border border-white/10 rounded-lg overflow-hidden">
                    <thead className="bg-primary/20">
                        <tr>
                            <th className="p-2 text-left">Imagem</th>
                            <th className="p-2 text-left">Nome</th>
                            <th className="p-2 text-right">Quantidade</th>
                            <th className="p-2 text-center">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredItems.map((item) => (
                            <tr key={item.id} className="border-b border-white/5 hover:bg-primary/10">
                                <td className="p-2">
                                    {item.image ? (
                                        <img src={item.image} alt={item.name} className="w-16 h-16 object-contain" />
                                    ) : (
                                        <span className="material-symbols-outlined text-4xl text-slate-700">image</span>
                                    )}
                                </td>
                                <td className="p-2 font-bold">{item.name}</td>
                                <td className="p-2 text-right font-mono">{computeQuantity(item.id)}</td>
                                <td className="p-2 flex justify-center gap-2">
                                    <button onClick={() => openStockModal(item, 'IN')} className="px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-xs">Entrada</button>
                                    <button onClick={() => openStockModal(item, 'OUT')} className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs">Saída</button>
                                    <button onClick={() => openStockModal(item, 'ADJUST')} className="px-2 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-xs">Ajuste</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </main>

            {/* ----- Stock Movement Modal ----- */}
            {isStockModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                    <div className="bg-surface-dark border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
                        <h2 className="text-xl font-bold mb-4 text-white">
                            {stockModalAction === 'IN' && 'Entrada de Placa'}
                            {stockModalAction === 'OUT' && 'Saída de Placa'}
                            {stockModalAction === 'ADJUST' && 'Ajuste de Estoque'}
                        </h2>
                        <form onSubmit={handleStockSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Quantidade</label>
                                <input
                                    type="number"
                                    required
                                    min="0"
                                    value={quantity}
                                    onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 0)}
                                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all"
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
                                    disabled={loading}
                                    className="flex-1 py-3 bg-primary hover:bg-primary-dark rounded-xl text-white font-bold shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
                                >
                                    Confirmar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ----- Create New Plate Modal ----- */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                    <div className="bg-surface-dark border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
                        <h2 className="text-xl font-bold mb-4 text-white">Nova Placa</h2>
                        <form onSubmit={handleCreateSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Nome</label>
                                <input
                                    type="text"
                                    required
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Imagem</label>
                                <div className="flex flex-col items-center gap-4">
                                    {newImage ? (
                                        <img src={newImage} alt="Preview" className="w-32 h-32 object-contain" />
                                    ) : (
                                        <span className="material-symbols-outlined text-4xl text-slate-700">add_a_photo</span>
                                    )}
                                    <label className="cursor-pointer bg-primary/20 hover:bg-primary/30 text-white py-1 px-3 rounded">
                                        Selecionar
                                        <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                    </label>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Quantidade inicial</label>
                                <input
                                    type="number"
                                    required
                                    min="0"
                                    value={newQuantity}
                                    onChange={(e) => setNewQuantity(parseInt(e.target.value, 10) || 0)}
                                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all"
                                />
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="flex-1 py-3 border border-white/10 rounded-xl text-slate-300 font-bold hover:bg-white/5 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-3 bg-primary hover:bg-primary-dark rounded-xl text-white font-bold shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
                                >
                                    Criar
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
