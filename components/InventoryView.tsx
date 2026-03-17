import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from './PageHeader';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Product } from '../types';

interface SignageItem extends Product {}

interface StockMovement {
    id: string;
    product_id: string;
    signage_id?: string; // For compatibility with existing state
    movement_type: 'IN' | 'OUT' | 'ADJUST';
    quantity: number;
    user_id?: string;
}

interface OrderItem {
    id: string;
    signage_id: string;
    quantity: number;
    received_quantity: number;
    status: 'PENDING' | 'PARTIAL' | 'RECEIVED';
    signage?: { name: string; image?: string };
    current_stock?: number;
    signage_name?: string;
}

interface Order {
    id: string;
    supplier: string;
    status: 'PENDING' | 'PARTIAL' | 'COMPLETED';
    created_at: string;
    items: OrderItem[];
    delivery_date?: string; // Add delivery_date to Order interface
}

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

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingPlate, setEditingPlate] = useState<any>(null);
    const [editName, setEditName] = useState('');
    const [editImage, setEditImage] = useState<string>('');

    // Order Modal State
    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [editingOrder, setEditingOrder] = useState<any>(null);
    const [newOrder, setNewOrder] = useState({ supplier: '', delivery_date: '' });
    const [orderItems, setOrderItems] = useState<{ signage_id: string; quantity: number; signage_name: string }[]>([]);
    const [itemToAdd, setItemToAdd] = useState({ signage_id: '', quantity: 1 });
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

    // Smart Search State
    const [itemSearchTerm, setItemSearchTerm] = useState('');
    const [showSearchList, setShowSearchList] = useState(false);

    // Calendar State
    const [showCalendar, setShowCalendar] = useState(false);
    const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
    const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        // Fetch Catalog & Stock
        const { data: signage } = await supabase
            .from('product_catalog')
            .select('*')
            .eq('is_signage', true)
            .order('name');
        
        const { data: stockData } = await supabase
            .from('product_stock')
            .select('*');

        // Fetch Orders with Items
        const { data: ordersData } = await supabase
            .from('signage_orders')
            .select(`
                *,
                items:signage_order_items (
                    *,
                    signage:product_catalog (name, image)
                )
            `)
            .order('created_at', { ascending: false });

        if (signage) setSignageItems(signage);
        if (stockData) setStock(stockData.map((s: any) => ({ ...s, signage_id: s.product_id })));
        if (ordersData && stockData) {
            const currentStockForMap = stockData.map((s: any) => ({ ...s, signage_id: s.product_id }));
            // Process ordersData to add current_stock to each item
            const processedOrders = ordersData.map((order: any) => ({
                ...order,
                items: (order.items || []).map((item: any) => ({
                    ...item,
                    current_stock: computeQuantity(item.signage_id, currentStockForMap)
                }))
            }));
            setOrders(processedOrders);
        }
        setLoading(false);
    };

    const computeQuantity = (id: string, currentStockData: StockMovement[] = stock) => {
        const movements = currentStockData.filter((s: StockMovement) => s.signage_id === id);
        return movements.reduce((sum: number, m: StockMovement) => {
            if (m.movement_type === 'IN') return sum + m.quantity;
            if (m.movement_type === 'OUT') return sum - m.quantity;
            if (m.movement_type === 'ADJUST') return sum + m.quantity;
            return sum;
        }, 0);
    };

    // ----- Stock Actions -----
    const openStockModal = (item: SignageItem, action: 'IN' | 'OUT' | 'ADJUST') => {
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
        await supabase.from('product_stock').insert([{ 
            product_id: selectedItem.id, 
            movement_type: stockModalAction, 
            quantity,
            user_id: user?.id
        }]);
        setIsStockModalOpen(false);
        fetchData();
    };

    // ----- Create Plate -----
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (isEdit) {
                    setEditImage(reader.result as string);
                } else {
                    setNewImage(reader.result as string);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleEditPlate = (plate: any) => {
        setEditingPlate(plate);
        setEditName(plate.name);
        setEditImage(plate.image || '');
        setIsEditModalOpen(true);
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingPlate) return;

        setLoading(true);
        const { error } = await supabase
            .from('product_catalog')
            .update({
                name: editName,
                image: editImage,
                user_id: user?.id
            })
            .eq('id', editingPlate.id);

        if (error) {
            alert('Erro ao atualizar: ' + error.message);
        } else {
            setIsEditModalOpen(false);
            setEditingPlate(null);
            fetchData();
            alert('Placa atualizada com sucesso!');
        }
        setLoading(false);
    };

    const handleDeletePlate = async (plate: any) => {
        if (!confirm(`Tem certeza que deseja excluir a placa "${plate.name}"? Esta ação não pode ser desfeita.`)) return;

        setLoading(true);
        try {
            // Delete related stock movements first
            await supabase.from('product_stock').delete().eq('product_id', plate.id);
            // Delete related order items
            await supabase.from('signage_order_items').delete().eq('signage_id', plate.id);
            // Delete the plate
            const { error } = await supabase.from('product_catalog').delete().eq('id', plate.id);
            if (error) throw error;

            fetchData();
            alert('Placa excluída com sucesso!');
        } catch (e: any) {
            alert('Erro ao excluir placa: ' + e.message);
        }
        setLoading(false);
    };

    const handleCreateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const { data: newPlate, error } = await supabase
            .from('product_catalog')
            .insert([{ 
                name: newName, 
                image: newImage,
                is_signage: true,
                category: 'Placas',
                unit: 'un',
                price: 20, // Preço padrão para placas
                user_id: user?.id
            }])
            .select();

        if (error) return alert('Erro: ' + error.message);

        const inserted = (newPlate as any[])[0];
        if (newQuantity > 0) {
            await supabase.from('product_stock').insert([{ 
                product_id: inserted.id, 
                movement_type: 'IN', 
                quantity: newQuantity,
                user_id: user?.id
            }]);
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

    const handleEditOrder = (order: Order) => {
        setEditingOrder(order);
        setNewOrder({
            supplier: order.supplier,
            delivery_date: order.delivery_date ? order.delivery_date.split('T')[0] : ''
        });
        setOrderItems(order.items.map((item: OrderItem) => ({
            signage_id: item.signage_id,
            quantity: item.quantity,
            signage_name: item.signage?.name || 'Unknown'
        })));
        setIsOrderModalOpen(true);
        setItemSearchTerm('');
        setShowSearchList(false);
    };

    const handleDeleteOrder = async (orderId: string) => {
        if (!confirm('Tem certeza que deseja excluir este pedido? Esta ação não pode ser desfeita.')) return;

        try {
            // Remove order items first due to FK constraints
            await supabase.from('signage_order_items').delete().eq('order_id', orderId);
            const { error } = await supabase.from('signage_orders').delete().eq('id', orderId);

            if (error) throw error;

            fetchData();
            alert('Pedido excluído com sucesso!');
        } catch (e: any) {
            alert('Erro ao excluir pedido: ' + e.message);
        }
    };

    const handleCreateOrder = async () => {
        if (orderItems.length === 0) {
            return alert('Erro: Você ainda não adicionou nenhum item à lista.');
        }

        try {
            let orderId = editingOrder?.id;

            if (editingOrder) {
                // Update existing order
                const { error: updateError } = await supabase
                    .from('signage_orders')
                    .update({
                        supplier: newOrder.supplier || 'Não informado',
                        delivery_date: newOrder.delivery_date || null
                    })
                    .eq('id', editingOrder.id);

                if (updateError) throw updateError;

                // Delete and re-insert items (simplest way to handle updates to item list)
                await supabase.from('signage_order_items').delete().eq('order_id', editingOrder.id);
            } else {
                // Create new order
                const { data: order, error } = await supabase.from('signage_orders').insert([{
                    supplier: newOrder.supplier || 'Não informado',
                    delivery_date: newOrder.delivery_date || null,
                    status: 'PENDING'
                }]).select().single();

                if (error) throw error;
                orderId = order.id;
            }

            const itemsPayload = orderItems.map(item => ({
                order_id: orderId,
                signage_id: item.signage_id,
                quantity: item.quantity,
                received_quantity: 0,
                status: 'PENDING'
            }));

            const { error: itemsError } = await supabase.from('signage_order_items').insert(itemsPayload);
            if (itemsError) throw itemsError;

            setIsOrderModalOpen(false);
            setEditingOrder(null);
            setNewOrder({ supplier: '', delivery_date: '' });
            setOrderItems([]);
            fetchData();
            alert(editingOrder ? 'Pedido atualizado com sucesso!' : 'Pedido criado com sucesso!');
        } catch (e: any) {
            console.error('Order save error:', e);
            alert('Erro ao salvar pedido: ' + e.message);
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
            await supabase.from('product_stock').insert([{
                product_id: itemSignageId,
                movement_type: 'IN',
                quantity: itemQty,
                user_id: user?.id
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

    const generateOrderPDF = (order: Order) => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();

        // Header
        doc.setFillColor(0, 0, 0);
        doc.rect(0, 0, pageWidth, 40, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text('INCÊNDIO BRASÍLIA ENGENHARIA', 20, 25);

        // Order Info
        doc.setTextColor(40, 40, 40);
        doc.setFontSize(16);
        doc.text('PEDIDO DE PLACAS', 20, 55);

        doc.setDrawColor(239, 68, 68);
        doc.setLineWidth(1);
        doc.line(20, 58, 60, 58);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Estabelecimento: ${order.supplier}`, 20, 70);
        doc.text(`Data do Pedido: ${new Date(order.created_at).toLocaleDateString('pt-BR')}`, 20, 76);
        doc.text(`Previsão de Entrega: ${order.delivery_date ? new Date(order.delivery_date).toLocaleDateString('pt-BR') : 'N/A'}`, 20, 82);
        doc.text(`Status: ${order.status === 'COMPLETED' ? 'Concluído' : order.status === 'PARTIAL' ? 'Parcial' : 'Pendente'}`, 20, 88);

        // Calculate total quantity
        const totalQuantity = order.items.reduce((sum: number, item: OrderItem) => sum + item.quantity, 0);
        doc.setFont('helvetica', 'bold');
        doc.text(`Total de Placas: ${totalQuantity}`, 20, 94);
        doc.setFont('helvetica', 'normal');

        // Collect image data for each row
        const imageDataMap: { [row: number]: string } = {};
        order.items.forEach((item: OrderItem, idx: number) => {
            if (item.signage?.image) {
                imageDataMap[idx] = item.signage.image;
            }
        });

        // Table data: placeholder for image column, then name, quantity, status
        const tableData = order.items.map((item: OrderItem) => [
            '', // Image placeholder
            item.signage?.name || 'N/A',
            item.quantity,
            item.status === 'RECEIVED' ? `Recebido (${item.received_quantity})` : 'Pendente'
        ]);

        // Add total row
        tableData.push([
            '',
            'TOTAL',
            totalQuantity,
            ''
        ]);

        autoTable(doc, {
            startY: 100,
            head: [['Imagem', 'Descrição da Placa', 'Quantidade', 'Status']],
            body: tableData,
            headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [245, 245, 245] },
            columnStyles: {
                0: { cellWidth: 22, halign: 'center' as const },
                1: { cellWidth: 'auto' as const },
                2: { cellWidth: 30, halign: 'center' as const },
                3: { cellWidth: 40, halign: 'center' as const }
            },
            styles: {
                minCellHeight: 20,
                valign: 'middle' as const
            },
            margin: { left: 20, right: 20 },
            didDrawCell: (data: any) => {
                // Draw thumbnail images in the first column (body rows only, not header or total row)
                if (data.section === 'body' && data.column.index === 0 && imageDataMap[data.row.index]) {
                    try {
                        const imgData = imageDataMap[data.row.index];
                        const imgSize = 14;
                        const x = data.cell.x + (data.cell.width - imgSize) / 2;
                        const y = data.cell.y + (data.cell.height - imgSize) / 2;
                        doc.addImage(imgData, 'PNG', x, y, imgSize, imgSize);
                    } catch (e) {
                        // If image fails to load, just skip it
                    }
                }
                // Style total row
                if (data.section === 'body' && data.row.index === order.items.length) {
                    doc.setFont('helvetica', 'bold');
                }
            },
            didParseCell: (data: any) => {
                // Style total row cells
                if (data.section === 'body' && data.row.index === order.items.length) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [220, 220, 220];
                }
            }
        });

        doc.save(`Pedido_Placas_${order.supplier.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`);
    };

    const filteredSignage = signageItems.filter((p: SignageItem) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <PageHeader
                title="Gestão de Placas"
                subtitle="Controle de estoque e pedidos."
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
                                onClick={() => {
                                    setEditingOrder(null);
                                    setNewOrder({ supplier: '', delivery_date: '' });
                                    setOrderItems([]);
                                    setIsOrderModalOpen(true);
                                    setItemSearchTerm('');
                                    setShowSearchList(false);
                                }}
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
                    Pedidos
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
                                {filteredSignage.map((item: SignageItem) => (
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
                                            <button onClick={() => handleEditPlate(item)} className="p-1 px-2 text-slate-400 hover:text-primary transition-colors hover:bg-white/5 rounded" title="Editar Placa">
                                                <span className="material-symbols-outlined text-[18px]">edit</span>
                                            </button>
                                            <button onClick={() => handleDeletePlate(item)} className="p-1 px-2 text-slate-400 hover:text-red-400 transition-colors hover:bg-red-500/5 rounded" title="Excluir Placa">
                                                <span className="material-symbols-outlined text-[18px]">delete</span>
                                            </button>
                                            <div className="w-[1px] h-4 bg-white/10 self-center mx-1"></div>
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
                        {orders.length === 0 ? (
                            <div className="text-center py-12 text-slate-500">
                                Nenhum pedido encontrado.
                            </div>
                        ) : (
                            orders.map((order: Order) => {
                                const unavailable = order.items.filter((item: OrderItem) => (item.current_stock || 0) < item.quantity);
                                return (
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
                                                <span className="px-2.5 py-1 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[14px]">inventory_2</span>
                                                    {order.items.reduce((sum: number, item: OrderItem) => sum + item.quantity, 0)} placas
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
                                                <button onClick={() => handleEditOrder(order)} className="p-1 text-slate-400 hover:text-blue-400 transition-colors">
                                                    <span className="material-symbols-outlined text-[20px]">edit</span>
                                                </button>
                                                <button onClick={() => handleDeleteOrder(order.id)} className="p-1 text-slate-400 hover:text-red-400 transition-colors">
                                                    <span className="material-symbols-outlined text-[20px]">delete</span>
                                                </button>
                                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${order.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-500' :
                                                    order.status === 'PARTIAL' ? 'bg-blue-500/10 text-blue-500' : 'bg-amber-500/10 text-amber-500'
                                                    }`}>
                                                    {order.status === 'COMPLETED' ? 'Concluído' : order.status === 'PARTIAL' ? 'Parcial' : 'Pendente'}
                                                </span>
                                                <span
                                                    className="material-symbols-outlined text-slate-400 transition-transform duration-200 cursor-pointer"
                                                    style={{ transform: expandedOrderId === order.id ? 'rotate(180deg)' : 'rotate(0deg)' }}
                                                    onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                                                >
                                                    expand_more
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 pr-4" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => generateOrderPDF(order)}
                                                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-bold transition-all"
                                                    title="Gerar PDF do Pedido"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                                                    PDF
                                                </button>
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
                                                        {order.items.map((item: OrderItem, idx: number) => (
                                                            <tr key={idx} className="border-b border-white/5 last:border-0 text-slate-300">
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
                                );
                            })
                        )}
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
                                        Selecionar <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e)} />
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

            {isEditModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                    <div className="bg-surface-dark border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
                        <h2 className="text-xl font-bold mb-4 text-white">Editar Placa</h2>
                        <form onSubmit={handleEditSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Nome</label>
                                <input 
                                    type="text" 
                                    required 
                                    value={editName} 
                                    onChange={(e) => setEditName(e.target.value)} 
                                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary transition-all" 
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Imagem</label>
                                <div className="flex flex-col items-center gap-4">
                                    {editImage ? (
                                        <img src={editImage} alt="Preview" className="w-32 h-32 object-contain rounded-lg border border-white/10 bg-white/5" />
                                    ) : (
                                        <div className="w-32 h-32 flex items-center justify-center border-2 border-dashed border-white/10 rounded-lg text-slate-600">
                                            <span className="material-symbols-outlined text-4xl">image_not_supported</span>
                                        </div>
                                    )}
                                    <label className="cursor-pointer bg-primary/20 hover:bg-primary/30 text-white py-1.5 px-4 rounded-lg text-sm font-bold transition-all">
                                        Alterar Imagem 
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, true)} />
                                    </label>
                                </div>
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => setIsEditModalOpen(false)} className="flex-1 py-4 border border-white/10 rounded-xl text-slate-300 font-bold hover:bg-white/5 transition-all">Cancelar</button>
                                <button type="submit" disabled={loading} className="flex-1 py-4 bg-primary hover:bg-primary-dark rounded-xl text-white font-bold shadow-lg shadow-primary/20 transition-all disabled:opacity-50">Salvar Alterações</button>
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
                            <span className="material-symbols-outlined">{editingOrder ? 'edit' : 'shopping_cart'}</span>
                            {editingOrder ? 'Editar Pedido' : 'Novo Pedido'}
                        </h2>

                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Estabelecimento</label>
                                <input
                                    type="text"
                                    placeholder="Nome da empresa..."
                                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary"
                                    value={newOrder.supplier}
                                    onChange={e => setNewOrder({ ...newOrder, supplier: e.target.value })}
                                />
                            </div>
                            <div className="relative">
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Previsão de Entrega</label>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!showCalendar) {
                                            // Initialize calendar to selected date or today
                                            if (newOrder.delivery_date) {
                                                const d = new Date(newOrder.delivery_date + 'T12:00:00');
                                                setCalendarMonth(d.getMonth());
                                                setCalendarYear(d.getFullYear());
                                            } else {
                                                setCalendarMonth(new Date().getMonth());
                                                setCalendarYear(new Date().getFullYear());
                                            }
                                        }
                                        setShowCalendar(!showCalendar);
                                    }}
                                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-left outline-none focus:border-primary transition-all flex items-center justify-between hover:border-white/20"
                                >
                                    <span className={newOrder.delivery_date ? 'text-white' : 'text-slate-500'}>
                                        {newOrder.delivery_date
                                            ? new Date(newOrder.delivery_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
                                            : 'Selecionar data...'}
                                    </span>
                                    <span className="material-symbols-outlined text-slate-400 text-[20px]">calendar_month</span>
                                </button>

                                {showCalendar && (
                                    <div className="absolute z-[70] top-full mt-2 right-0 bg-[#1E1E2A] border border-white/10 rounded-2xl shadow-2xl p-4 w-[320px] animate-in fade-in slide-in-from-top-2 duration-200">
                                        {/* Month/Year Navigation */}
                                        <div className="flex items-center justify-between mb-3">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(calendarYear - 1); }
                                                    else setCalendarMonth(calendarMonth - 1);
                                                }}
                                                className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                                            </button>
                                            <span className="text-sm font-bold text-white capitalize">
                                                {new Date(calendarYear, calendarMonth).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(calendarYear + 1); }
                                                    else setCalendarMonth(calendarMonth + 1);
                                                }}
                                                className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                                            </button>
                                        </div>

                                        {/* Weekday Headers */}
                                        <div className="grid grid-cols-7 mb-1">
                                            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                                                <div key={d} className="text-center text-[10px] font-bold text-slate-500 uppercase py-1">{d}</div>
                                            ))}
                                        </div>

                                        {/* Calendar Days */}
                                        <div className="grid grid-cols-7 gap-0.5">
                                            {(() => {
                                                const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
                                                const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
                                                const today = new Date();
                                                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                                                const cells = [];

                                                // Empty cells for days before the 1st
                                                for (let i = 0; i < firstDay; i++) {
                                                    cells.push(<div key={`empty-${i}`} />);
                                                }

                                                for (let day = 1; day <= daysInMonth; day++) {
                                                    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                                    const isSelected = newOrder.delivery_date === dateStr;
                                                    const isToday = dateStr === todayStr;

                                                    cells.push(
                                                        <button
                                                            key={day}
                                                            type="button"
                                                            onClick={() => {
                                                                setNewOrder({ ...newOrder, delivery_date: dateStr });
                                                                setShowCalendar(false);
                                                            }}
                                                            className={`w-full aspect-square rounded-lg text-xs font-medium flex items-center justify-center transition-all
                                                                ${isSelected
                                                                    ? 'bg-primary text-white font-bold shadow-lg shadow-primary/30 scale-110'
                                                                    : isToday
                                                                        ? 'bg-primary/15 text-primary font-bold ring-1 ring-primary/30'
                                                                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                                                                }`}
                                                        >
                                                            {day}
                                                        </button>
                                                    );
                                                }
                                                return cells;
                                            })()}
                                        </div>

                                        {/* Quick Select */}
                                        <div className="flex gap-2 mt-3 pt-3 border-t border-white/5">
                                            {[
                                                { label: 'Hoje', days: 0 },
                                                { label: '+7d', days: 7 },
                                                { label: '+15d', days: 15 },
                                                { label: '+30d', days: 30 },
                                            ].map(opt => {
                                                const d = new Date();
                                                d.setDate(d.getDate() + opt.days);
                                                const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                                return (
                                                    <button
                                                        key={opt.label}
                                                        type="button"
                                                        onClick={() => {
                                                            setNewOrder({ ...newOrder, delivery_date: val });
                                                            setCalendarMonth(d.getMonth());
                                                            setCalendarYear(d.getFullYear());
                                                            setShowCalendar(false);
                                                        }}
                                                        className="flex-1 py-1.5 text-[11px] font-bold rounded-lg bg-white/5 hover:bg-primary/20 text-slate-300 hover:text-primary transition-all"
                                                    >
                                                        {opt.label}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Clear */}
                                        {newOrder.delivery_date && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setNewOrder({ ...newOrder, delivery_date: '' });
                                                    setShowCalendar(false);
                                                }}
                                                className="w-full mt-2 py-1.5 text-[11px] font-bold rounded-lg text-red-400 hover:bg-red-500/10 transition-all"
                                            >
                                                Limpar data
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-background-dark/50 p-4 rounded-xl border border-white/5 mb-6">
                            <h3 className="text-sm font-bold text-white mb-4">Adicionar Itens</h3>
                            <div className="flex gap-3 mb-4 items-end">
                                <div className="flex-1 relative">
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Placa</label>
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">search</span>
                                        <input
                                            type="text"
                                            className="w-full bg-background-dark border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white outline-none focus:border-primary text-sm transition-all"
                                            placeholder="Pesquise a placa..."
                                            value={itemSearchTerm}
                                            onChange={e => {
                                                setItemSearchTerm(e.target.value);
                                                setShowSearchList(true);
                                            }}
                                            onFocus={() => setShowSearchList(true)}
                                        />
                                    </div>

                                    {showSearchList && itemSearchTerm && (
                                        <div className="absolute z-[60] w-full mt-2 bg-[#2D2D39] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                                            {signageItems
                                                .filter((item: SignageItem) => item.name.toLowerCase().includes(itemSearchTerm.toLowerCase()))
                                                .map((item: SignageItem) => (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => {
                                                            setItemToAdd({ ...itemToAdd, signage_id: item.id });
                                                            setItemSearchTerm(item.name);
                                                            setShowSearchList(false);
                                                        }}
                                                        className="w-full text-left px-4 py-3 hover:bg-primary/20 text-sm border-b border-white/5 last:border-none group flex justify-between items-center"
                                                    >
                                                        <div className="flex flex-col">
                                                            <span className="text-white font-medium group-hover:text-primary transition-colors text-[11px] uppercase">{item.name}</span>
                                                            <span className="text-xs text-slate-400">Estoque: {computeQuantity(item.id)}</span>
                                                        </div>
                                                        <span className="material-symbols-outlined text-primary opacity-0 group-hover:opacity-100 transition-all">add_circle</span>
                                                    </button>
                                                ))}
                                            {signageItems.filter((item: SignageItem) => item.name.toLowerCase().includes(itemSearchTerm.toLowerCase())).length === 0 && (
                                                <div className="p-4 text-center text-slate-500 text-xs italic">Nenhuma placa encontrada.</div>
                                            )}
                                        </div>
                                    )}
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
                                    onClick={() => {
                                        handleAddOrderItem();
                                        setItemSearchTerm('');
                                    }}
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
                                            {orderItems.map((item, idx: number) => (
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
                                {editingOrder ? 'Salvar Alterações' : 'Finalizar Pedido'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventoryView;
