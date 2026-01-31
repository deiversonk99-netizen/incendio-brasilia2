import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Project } from '../types';

interface NewTransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    initialType?: 'INCOME' | 'EXPENSE';
    editingTransaction?: any; // Using any for simplicity as Transaction type might be slightly different here
}

interface Client {
    id: string;
    name: string;
}

const NewTransactionModal: React.FC<NewTransactionModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    initialType = 'EXPENSE',
    editingTransaction = null
}) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [projects, setProjects] = useState<Project[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [formData, setFormData] = useState({
        description: '',
        value: '', // Total Value
        installmentValue: '', // Value per installment
        type: initialType,
        entity: '',
        date: new Date().toISOString().split('T')[0],
        category: '',
        status: 'PAID' as 'PAID' | 'PENDING',
        project_id: '',
        installments: '1',
    });

    useEffect(() => {
        if (isOpen) {
            fetchInitialData();
            if (editingTransaction) {
                const totalVal = editingTransaction.value * (editingTransaction.total_installments || 1);
                setFormData({
                    description: editingTransaction.description,
                    value: totalVal.toString(),
                    installmentValue: editingTransaction.value.toString(),
                    type: editingTransaction.type,
                    entity: editingTransaction.entity || '',
                    date: editingTransaction.date,
                    category: editingTransaction.category || '',
                    status: editingTransaction.status,
                    project_id: editingTransaction.project_id || '',
                    installments: (editingTransaction.total_installments || 1).toString(),
                });
            } else {
                setFormData(prev => ({
                    ...prev,
                    type: initialType,
                    description: '',
                    value: '',
                    installmentValue: '',
                    entity: '',
                    date: new Date().toISOString().split('T')[0],
                    category: '',
                    status: 'PAID',
                    project_id: '',
                    installments: '1',
                }));
            }
        }
    }, [isOpen, initialType, editingTransaction]);

    const fetchInitialData = async () => {
        const [
            projRes,
            clientRes,
            fData,
            bData,
            prData
        ] = await Promise.all([
            supabase.from('projects').select('*').order('name'),
            supabase.from('clients').select('id, name').order('name'),
            supabase.from('floors').select('project_id'),
            supabase.from('budget_items').select('project_id'),
            supabase.from('proposals').select('project_id')
        ]);

        if (projRes.data) {
            const linkedProjectIds = new Set([
                ...(fData.data || []).map(f => f.project_id),
                ...(bData.data || []).map(b => b.project_id),
                ...(prData.data || []).map(pr => pr.project_id)
            ]);

            // Filter and unique
            const filtered = projRes.data.filter(p => linkedProjectIds.has(p.id));
            const unique: Project[] = [];
            const seen = new Set();
            filtered.forEach(p => {
                if (!seen.has(p.name)) {
                    unique.push(p);
                    seen.add(p.name);
                }
            });
            setProjects(unique);
        }
        if (clientRes.data) setClients(clientRes.data);
    };

    const handleTotalValueChange = (total: string) => {
        const num = parseFloat(total) || 0;
        const instCount = parseInt(formData.installments) || 1;
        setFormData(prev => ({
            ...prev,
            value: total,
            installmentValue: instCount > 0 ? (num / instCount).toFixed(2) : total
        }));
    };

    const handleInstallmentValueChange = (instValue: string) => {
        const num = parseFloat(instValue) || 0;
        const instCount = parseInt(formData.installments) || 1;
        setFormData(prev => ({
            ...prev,
            installmentValue: instValue,
            value: (num * instCount).toFixed(2)
        }));
    };

    const handleInstallmentsChange = (count: string) => {
        const instCount = parseInt(count) || 1;
        const total = parseFloat(formData.value) || 0;
        setFormData(prev => ({
            ...prev,
            installments: count,
            installmentValue: instCount > 0 ? (total / instCount).toFixed(2) : prev.installmentValue
        }));
    };

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setLoading(true);
        try {
            const numInstallments = parseInt(formData.installments) || 1;
            const totalValue = parseFloat(formData.value) || 0;
            const installmentValue = totalValue / numInstallments;

            if (editingTransaction) {
                // Update specific transaction
                const { error } = await supabase
                    .from('financial_transactions')
                    .update({
                        description: formData.description,
                        value: installmentValue,
                        type: formData.type,
                        entity: formData.entity,
                        date: formData.date,
                        category: formData.category,
                        status: formData.status,
                        project_id: formData.project_id || null,
                    })
                    .eq('id', editingTransaction.id);

                if (error) throw error;
            } else {
                // Create new (potentially multiple)
                const installmentGroupId = numInstallments > 1 ? crypto.randomUUID() : null;

                const transactionsToInsert = [];
                const baseDate = new Date(formData.date + 'T12:00:00');

                for (let i = 0; i < numInstallments; i++) {
                    const installmentDate = new Date(baseDate);
                    installmentDate.setMonth(baseDate.getMonth() + i);

                    transactionsToInsert.push({
                        description: numInstallments > 1
                            ? `${formData.description} (${i + 1}/${numInstallments})`
                            : formData.description,
                        value: installmentValue,
                        type: formData.type,
                        entity: formData.entity,
                        date: installmentDate.toISOString().split('T')[0],
                        category: formData.category,
                        status: i === 0 ? formData.status : 'PENDING',
                        project_id: formData.project_id || null,
                        user_id: user.id,
                        installment_group_id: installmentGroupId,
                        installment_number: i + 1,
                        total_installments: numInstallments
                    });
                }

                const { error } = await supabase.from('financial_transactions').insert(transactionsToInsert);
                if (error) throw error;
            }

            onSuccess();
            onClose();
            // Reset form
            setFormData({
                description: '',
                value: '',
                installmentValue: '',
                type: initialType,
                entity: '',
                date: new Date().toISOString().split('T')[0],
                category: '',
                status: 'PAID',
                project_id: '',
                installments: '1',
            });
        } catch (error) {
            console.error('Error creating transaction:', error);
            alert('Erro ao registrar transação. Verifique se a tabela foi criada.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-2xl bg-surface-dark border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[95vh] md:max-h-[90vh]">
                <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
                    <h2 className="text-xl font-bold text-white">
                        {editingTransaction
                            ? (formData.type === 'INCOME' ? 'Editar Venda' : 'Editar Despesa')
                            : (formData.type === 'INCOME' ? 'Nova Venda' : 'Nova Despesa')}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                    {/* Type Toggle - Disable if editing? Usually better to keep as is but user might change it.
                        Actually, let's keep it but maybe hide if it complicates things. For now keep.
                    */}
                    {!editingTransaction && (
                        <div className="flex p-1 bg-background-dark rounded-xl border border-white/5">
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, type: 'INCOME' })}
                                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${formData.type === 'INCOME'
                                    ? 'bg-emerald-500 text-white shadow-lg'
                                    : 'text-slate-500 hover:text-white'
                                    }`}
                            >
                                Entrada / Venda
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, type: 'EXPENSE' })}
                                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${formData.type === 'EXPENSE'
                                    ? 'bg-primary text-white shadow-lg'
                                    : 'text-slate-500 hover:text-white'
                                    }`}
                            >
                                Saída / Despesa
                            </button>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5 font-bold">Descrição</label>
                        <input
                            type="text"
                            required
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                            className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-primary outline-none"
                            placeholder="Ex: Pagamento 1ª Parcela - Obra X"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5 font-bold">Valor Total (R$)</label>
                            <input
                                type="number"
                                step="0.01"
                                required
                                value={formData.value}
                                onChange={e => handleTotalValueChange(e.target.value)}
                                className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-primary outline-none text-sm"
                                placeholder="0,00"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5 font-bold">Valor da Parcela (R$)</label>
                            <input
                                type="number"
                                step="0.01"
                                required
                                value={formData.installmentValue}
                                onChange={e => handleInstallmentValueChange(e.target.value)}
                                className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-primary outline-none text-sm"
                                placeholder="0,00"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5 font-bold">Parcelas</label>
                            <select
                                value={formData.installments}
                                onChange={e => handleInstallmentsChange(e.target.value)}
                                disabled={!!editingTransaction}
                                className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-primary outline-none text-sm disabled:opacity-50"
                            >
                                {[1, 2, 3, 4, 5, 6, 10, 12, 24, 36].map(n => (
                                    <option key={n} value={n}>{n}x</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5 font-bold">Data Início</label>
                            <input
                                type="date"
                                required
                                value={formData.date}
                                onChange={e => setFormData({ ...formData, date: e.target.value })}
                                className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-primary outline-none text-sm"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5 font-bold">
                                {formData.type === 'INCOME' ? 'Cliente' : 'Fornecedor'}
                            </label>
                            {formData.type === 'INCOME' ? (
                                <select
                                    value={formData.entity}
                                    onChange={e => setFormData({ ...formData, entity: e.target.value })}
                                    className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-primary outline-none text-sm"
                                    required
                                >
                                    <option value="">Selecione um cliente...</option>
                                    {clients.map(c => (
                                        <option key={c.id} value={c.name}>{c.name}</option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    value={formData.entity}
                                    onChange={e => setFormData({ ...formData, entity: e.target.value })}
                                    className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-primary outline-none text-sm"
                                    placeholder="Nome da empresa/pessoa"
                                />
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5 font-bold">Categoria</label>
                            <input
                                type="text"
                                value={formData.category}
                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                                className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-primary outline-none"
                                placeholder="Ex: Material, Obra, etc."
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5 font-bold">Vincular Projeto (Opcional)</label>
                        <select
                            value={formData.project_id}
                            onChange={e => setFormData({ ...formData, project_id: e.target.value })}
                            className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-primary outline-none"
                        >
                            <option value="">Nenhum projeto selecionado</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase text-slate-500 mb-2 font-bold">Status do Pagamento</label>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input
                                    type="radio"
                                    name="status"
                                    checked={formData.status === 'PAID'}
                                    onChange={() => setFormData({ ...formData, status: 'PAID' })}
                                    className="hidden"
                                />
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${formData.status === 'PAID' ? 'border-emerald-500 bg-emerald-500' : 'border-white/10'
                                    }`}>
                                    {formData.status === 'PAID' && <span className="material-symbols-outlined text-white text-[14px] font-bold">check</span>}
                                </div>
                                <span className={formData.status === 'PAID' ? 'text-white' : 'text-slate-500'}>Pago</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input
                                    type="radio"
                                    name="status"
                                    checked={formData.status === 'PENDING'}
                                    onChange={() => setFormData({ ...formData, status: 'PENDING' })}
                                    className="hidden"
                                />
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${formData.status === 'PENDING' ? 'border-amber-500 bg-amber-500' : 'border-white/10'
                                    }`}>
                                    {formData.status === 'PENDING' && <span className="material-symbols-outlined text-white text-[14px] font-bold">schedule</span>}
                                </div>
                                <span className={formData.status === 'PENDING' ? 'text-white' : 'text-slate-500'}>Pendente</span>
                            </label>
                        </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 rounded-lg border border-white/10 py-3 font-bold text-slate-300 hover:bg-white/5 transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 rounded-lg bg-primary py-3 font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary-dark disabled:opacity-50 transition-all"
                        >
                            {loading ? 'Salvando...' : 'Confirmar Lançamento'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default NewTransactionModal;
