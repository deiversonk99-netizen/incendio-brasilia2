import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from './PageHeader';

const InventoryView: React.FC = () => {
    const { user } = useAuth();
    const [signageItems, setSignageItems] = useState<any[]>([]);
    const [stock, setStock] = useState<any[]>([]);
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'CATALOG' | 'ORDERS'>('CATALOG');

    // Modals
    const [isStockModalOpen, setIsStockModalOpen] = useState(false);
    const [stockModalAction, setStockModalAction] = useState<'IN' | 'OUT' | 'ADJUST'>('IN');
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [quantity, setQuantity] = useState<number>(0);

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [newImage, setNewImage] = useState<string>('');
    const [newQuantity, setNewQuantity] = useState<number>(0);

    // Order Modal State
    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [newOrder, setNewOrder] = useState({ supplier: '', delivery_date: '' });
    const [orderItems, setOrderItems] = useState<{ signage_id: string; quantity: number; signage_name: string }[]>([]);
    const [itemToAdd, setItemToAdd] = useState({ signage_id: '', quantity: 1 });
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        // Fetch Catalog & Stock
        const { data: signage } = await supabase.from('signage_catalog').select('*').order('name');
        const { data: stockData } = await supabase.from('signage_stock').select('*');

        // Fetch Orders with Items
        const { data: ordersData } = await supabase
            .from('signage_orders')
            .select(`
                *,
                items:signage_order_items (
                    *,
                    signage:signage_catalog (name, image)
                )
            `)
            .order('created_at', { ascending: false });

        if (signage) setSignageItems(signage);
        if (stockData) setStock(stockData);
        if (ordersData) setOrders(ordersData);
        setLoading(false);
    };

    const computeQuantity = (id: string, currentStockData = stock) => {
        const movements = currentStockData.filter((s) => s.signage_id === id);
        return movements.reduce((sum, m) => {
            if (m.movement_type === 'IN') return sum + m.quantity;
            if (m.movement_type === 'OUT') return sum - m.quantity;
            return sum + m.quantity; // ADJUST
        }, 0);
    };

    // ----- Stock Actions -----
    const openStockModal = (item: any, action: 'IN' | 'OUT' | 'ADJUST') => {
        setSelectedItem(item);
        setStockModalAction(action);
        setQuantity(0);
        setIsStockModalOpen(true);
    };

    const handleStockSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedItem) return;
        if (stockModalAction === 'OUT') {
            const currentQty = computeQuantity(selectedItem.id);
            if (quantity > currentQty) {
                alert('Quantidade de saída maior que o estoque disponível.');
                return;
            }
        }
        await supabase.from('signage_stock').insert([{ signage_id: selectedItem.id, movement_type: stockModalAction, quantity }]);
        setIsStockModalOpen(false);
        fetchData();
    };

    // ----- Create Plate -----
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setNewImage(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleCreateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const { data: newPlate, error } = await supabase.from('signage_catalog').insert([{ name: newName, image: newImage }]).select();
        if (error) return alert('Erro: ' + error.message);

        const inserted = (newPlate as any[])[0];
        if (newQuantity > 0) {
            await supabase.from('signage_stock').insert([{ signage_id: inserted.id, movement_type: 'IN', quantity: newQuantity }]);
        }

        setIsCreateModalOpen(false);
        setNewName(''); setNewImage(''); setNewQuantity(0);
        fetchData();
    };

    // ----- Order Actions -----
    const handleAddOrderItem = () => {
        if (!itemToAdd.signage_id || itemToAdd.quantity <= 0) return;
        const plate = signageItems.find(p => p.id === itemToAdd.signage_id);
        const newItem = { ...itemToAdd, signage_name: plate?.name || 'Unknown' };
        setOrderItems([...orderItems, newItem]);
        setItemToAdd({ signage_id: '', quantity: 1 });
        // console.log('Added item:', newItem); // Debugging
    };

    const handleCreateOrder = async () => {
        console.log('Finalizing order with items:', orderItems);
        if (orderItems.length === 0) {
            return alert('Erro: Você ainda não adicionou nenhum item à lista. Clique no botão "+" ao lado da quantidade para adicionar o item antes de finalizar.');
        }

        try {
            const { data: order, error } = await supabase.from('signage_orders').insert([{
                supplier: newOrder.supplier || 'Não informado',
                delivery_date: newOrder.delivery_date || null,
                status: 'PENDING'
            }]).select().single();

            if (error) throw error;

            const itemsPayload = orderItems.map(item => ({
                order_id: order.id,
                signage_id: item.signage_id,
                quantity: item.quantity,
                received_quantity: 0,
                status: 'PENDING'
            }));

            const { error: itemsError } = await supabase.from('signage_order_items').insert(itemsPayload);
            if (itemsError) throw itemsError;

            setIsOrderModalOpen(false);
            setNewOrder({ supplier: '', delivery_date: '' });
            setOrderItems([]);
            fetchData();
            alert('Pedido criado com sucesso!');
        } catch (e: any) {
            console.error('Order creation error:', e);
            alert('Erro ao criar pedido: ' + e.message);
        }
    };

    const handleReceiveItem = async (orderId: string, itemId: string, itemQty: number, itemSignageId: string) => {
        if (!confirm(`Confirma o recebimento de ${itemQty} unidades? Isso adicionará ao estoque.`)) return;

        try {
            // 1. Update Item Status
            const { error: updateError } = await supabase
                .from('signage_order_items')
                .update({ status: 'RECEIVED', received_quantity: itemQty })
                .eq('id', itemId);
            if (updateError) throw updateError;

            // 2. Add to Stock
            await supabase.from('signage_stock').insert([{
                signage_id: itemSignageId,
                movement_type: 'IN',
                quantity: itemQty
            }]);

            // 3. Check if all items received to update Order Status
            const { data: orderData } = await supabase
                .from('signage_orders')
                .select('*, items:signage_order_items(*)')
                .eq('id', orderId)
                .single();

            if (orderData) {
                const allReceived = orderData.items.every((i: any) => i.status === 'RECEIVED');
                if (allReceived) {
                    await supabase.from('signage_orders').update({ status: 'COMPLETED' }).eq('id', orderId);
                } else if (orderData.status === 'PENDING') {
                    await supabase.from('signage_orders').update({ status: 'PARTIAL' }).eq('id', orderId);
                }
            }

            fetchData();
        } catch (e: any) {
            alert('Erro ao receber item: ' + e.message);
        }
    };

    const filteredItems = signageItems.filter((item) =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <PageHeader
                title="Gestão de Placas"
                subtitle="Controle de estoque e pedidos de compra."
                actions={
                    <div className="flex gap-2">
                        {activeTab === 'CATALOG' ? (
                            <button
                                onClick={() => setIsCreateModalOpen(true)}
                                className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary hover:bg-primary-dark text-white shadow-lg shadow-primary/20 transition-all font-bold text-sm"
                            >
                                <span className="material-symbols-outlined text-[18px]">add</span>
                                Nova Placa
                            </button>
                        ) : (
                            <button
                                onClick={() => setIsOrderModalOpen(true)}
                                className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary hover:bg-primary-dark text-white shadow-lg shadow-primary/20 transition-all font-bold text-sm"
                            >
                                <span className="material-symbols-outlined text-[18px]">shopping_cart_checkout</span>
                                Novo Pedido
                            </button>
                        )}
                    </div>
                }
            />

            <div className="px-8 border-b border-white/10 flex gap-6">
                <button
                    onClick={() => setActiveTab('CATALOG')}
                    className={`py-4 text-sm font-bold border-b-2 transition-all ${activeTab === 'CATALOG' ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-white'}`}
                >
                    Catálogo / Estoque
                </button>
                <button
                    onClick={() => setActiveTab('ORDERS')}
                    className={`py-4 text-sm font-bold border-b-2 transition-all ${activeTab === 'ORDERS' ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-white'}`}
                >
                    Pedidos de Compra
                </button>
            </div>

            <main className="flex-1 overflow-auto p-8">
                {activeTab === 'CATALOG' && (
                    <>
                        <div className="mb-6 flex items-center justify-between">
                            <div className="relative max-w-md w-full">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[20px]">search</span>
                                <input
                                    type="text"
                                    placeholder="Buscar placa..."
                                    className="w-full bg-surface-dark border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white outline-none focus:border-primary transition-all shadow-sm"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex justify-between items-center mb-4">
                            <div></div>
                            {/* Re-adding the CSV button if desired, but sticking to requested table change first */}
                            {/* If user wants the exact previous state, I should probably re-add the report button too, but let's focus on the table structure first as per "lista" request */}
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
                    </>
                )}

                {activeTab === 'ORDERS' && (
                    <div className="space-y-4">
                        {orders.length === 0 && (
                            <div className="text-center py-12 text-slate-500">Nenhum pedido registrado.</div>
                        )}
                        {orders.map(order => (
                            <div key={order.id} className="bg-surface-dark border border-white/10 rounded-xl overflow-hidden">
                                <div
                                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
                                    onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${order.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500'}`}>
                                            <span className="material-symbols-outlined">{order.status === 'COMPLETED' ? 'check_circle' : 'pending'}</span>
                                        </div>
                                        <div>
                                            <div className="font-bold text-white">{order.supplier}</div>
                                            <div className="text-xs text-slate-400">Entrega: {order.delivery_date ? new Date(order.delivery_date).toLocaleDateString('pt-BR') : 'N/A'}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${order.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-500' :
                                            order.status === 'PARTIAL' ? 'bg-blue-500/10 text-blue-500' : 'bg-amber-500/10 text-amber-500'
                                            }`}>
                                            {order.status === 'COMPLETED' ? 'Concluído' : order.status === 'PARTIAL' ? 'Parcial' : 'Pendente'}
                                        </span>
                                        <span className="material-symbols-outlined text-slate-400 transition-transform duration-200" style={{ transform: expandedOrderId === order.id ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
                                    </div>
                                </div>

                                {expandedOrderId === order.id && (
                                    <div className="border-t border-white/5 bg-black/20 p-4">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-slate-500 text-xs uppercase text-left">
                                                    <th className="pb-3">Placa</th>
                                                    <th className="pb-3 text-center">Qtd. Pedida</th>
                                                    <th className="pb-3 text-center">Status</th>
                                                    <th className="pb-3 text-right">Ação</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {order.items.map((item: any) => (
                                                    <tr key={item.id} className="border-b border-white/5 last:border-0 text-slate-300">
                                                        <td className="py-3 flex items-center gap-3">
                                                            {item.signage?.image && <img src={item.signage.image} className="w-8 h-8 object-contain rounded bg-white/5" />}
                                                            <span>{item.signage?.name}</span>
                                                        </td>
                                                        <td className="py-3 text-center font-mono">{item.quantity}</td>
                                                        <td className="py-3 text-center">
                                                            {item.status === 'RECEIVED' ? (
                                                                <span className="text-emerald-500 font-bold text-xs">Recebido ({item.received_quantity})</span>
                                                            ) : (
                                                                <span className="text-amber-500 font-bold text-xs">Pendente</span>
                                                            )}
                                                        </td>
                                                        <td className="py-3 text-right">
                                                            {item.status === 'PENDING' && (
                                                                <button
                                                                    onClick={() => handleReceiveItem(order.id, item.id, item.quantity, item.signage_id)}
                                                                    className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-sm font-bold shadow-lg shadow-primary/20 transition-all active:scale-95"
                                                                >
                                                                    <span className="material-symbols-outlined text-[20px]">check_circle</span>
                                                                    Receber Placas
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Existing Modals ... (Stock, Create) */}
            {isStockModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                    <div className="bg-surface-dark border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
                        <h2 className="text-xl font-bold mb-4 text-white">Movimentação de Estoque</h2>
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
                                <button type="button" onClick={() => setIsStockModalOpen(false)} className="flex-1 py-3 border border-white/10 rounded-xl text-slate-300 font-bold hover:bg-white/5 transition-all">Cancelar</button>
                                <button type="submit" disabled={loading} className="flex-1 py-3 bg-primary hover:bg-primary-dark rounded-xl text-white font-bold shadow-lg shadow-primary/20 transition-all disabled:opacity-50">Confirmar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                    <div className="bg-surface-dark border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
                        <h2 className="text-xl font-bold mb-4 text-white">Nova Placa</h2>
                        <form onSubmit={handleCreateSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Nome</label>
                                <input type="text" required value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Imagem</label>
                                <div className="flex flex-col items-center gap-4">
                                    {newImage ? <img src={newImage} alt="Preview" className="w-32 h-32 object-contain" /> : <span className="material-symbols-outlined text-4xl text-slate-700">add_a_photo</span>}
                                    <label className="cursor-pointer bg-primary/20 hover:bg-primary/30 text-white py-1 px-3 rounded">
                                        Selecionar <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                    </label>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Quantidade inicial</label>
                                <input type="number" required min="0" value={newQuantity} onChange={(e) => setNewQuantity(parseInt(e.target.value, 10) || 0)} className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all" />
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="flex-1 py-3 border border-white/10 rounded-xl text-slate-300 font-bold hover:bg-white/5 transition-all">Cancelar</button>
                                <button type="submit" disabled={loading} className="flex-1 py-3 bg-primary hover:bg-primary-dark rounded-xl text-white font-bold shadow-lg shadow-primary/20 transition-all disabled:opacity-50">Criar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* NEW ORDER MODAL */}
            {isOrderModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                    <div className="bg-surface-dark border border-white/10 rounded-2xl p-8 w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold mb-6 text-white flex items-center gap-2">
                            <span className="material-symbols-outlined">shopping_cart</span>
                            Novo Pedido de Compra
                        </h2>

                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Fornecedor</label>
                                <input
                                    type="text"
                                    placeholder="Nome da empresa..."
                                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary"
                                    value={newOrder.supplier}
                                    onChange={e => setNewOrder({ ...newOrder, supplier: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Previsão de Entrega</label>
                                <input
                                    type="date"
                                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary"
                                    value={newOrder.delivery_date}
                                    onChange={e => setNewOrder({ ...newOrder, delivery_date: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="bg-background-dark/50 p-4 rounded-xl border border-white/5 mb-6">
                            <h3 className="text-sm font-bold text-white mb-4">Adicionar Itens</h3>
                            <div className="flex gap-3 mb-4 items-end">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Placa</label>
                                    <select
                                        className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary text-sm"
                                        value={itemToAdd.signage_id}
                                        onChange={e => setItemToAdd({ ...itemToAdd, signage_id: e.target.value })}
                                    >
                                        <option value="">Selecione...</option>
                                        {signageItems.map(item => (
                                            <option key={item.id} value={item.id}>
                                                {item.name} (Estoque: {computeQuantity(item.id)})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="w-24">
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Qtd</label>
                                    <input
                                        type="number"
                                        min="1"
                                        className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary text-center"
                                        value={itemToAdd.quantity}
                                        onChange={e => setItemToAdd({ ...itemToAdd, quantity: parseInt(e.target.value) || 1 })}
                                    />
                                </div>
                                <button
                                    onClick={handleAddOrderItem}
                                    disabled={!itemToAdd.signage_id}
                                    className="h-[46px] px-6 bg-primary hover:bg-primary-dark rounded-xl text-white font-bold shadow-lg shadow-primary/20 transition-all disabled:opacity-50 disabled:bg-white/10 flex items-center gap-2 active:scale-95"
                                >
                                    <span className="material-symbols-outlined">add</span>
                                    Adicionar Item
                                </button>
                            </div>

                            {/* Items List */}
                            {orderItems.length > 0 && (
                                <div className="border border-white/10 rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-white/5">
                                            <tr>
                                                <th className="p-3 text-left text-slate-400 font-normal">Item</th>
                                                <th className="p-3 text-center text-slate-400 font-normal">Qtd</th>
                                                <th className="p-3"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {orderItems.map((item, idx) => (
                                                <tr key={idx} className="border-b border-white/5 last:border-0 text-slate-300">
                                                    <td className="p-3">{item.signage_name}</td>
                                                    <td className="p-3 text-center font-mono">{item.quantity}</td>
                                                    <td className="p-3 text-right">
                                                        <button
                                                            onClick={() => setOrderItems(orderItems.filter((_, i) => i !== idx))}
                                                            className="text-red-400 hover:text-red-300"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setIsOrderModalOpen(false)}
                                className="flex-1 py-3 border border-white/10 rounded-xl text-slate-300 font-bold hover:bg-white/5 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCreateOrder}
                                className="flex-1 py-3 bg-primary hover:bg-primary-dark rounded-xl text-white font-bold shadow-lg shadow-primary/20 transition-all"
                            >
                                Finalizar Pedido
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventoryView;
