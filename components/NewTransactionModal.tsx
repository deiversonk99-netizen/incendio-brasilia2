import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Project } from '../types';

interface NewTransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    initialType?: 'INCOME' | 'EXPENSE';
}

const NewTransactionModal: React.FC<NewTransactionModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    initialType = 'EXPENSE'
}) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [projects, setProjects] = useState<Project[]>([]);
    const [formData, setFormData] = useState({
        description: '',
        value: '',
        type: initialType,
        entity: '',
        date: new Date().toISOString().split('T')[0],
        category: '',
        status: 'PAID' as 'PAID' | 'PENDING',
        project_id: '',
    });

    useEffect(() => {
        if (isOpen) {
            fetchProjects();
            setFormData(prev => ({ ...prev, type: initialType }));
        }
    }, [isOpen, initialType]);

    const fetchProjects = async () => {
        const { data } = await supabase.from('projects').select('*').order('name');
        if (data) setProjects(data);
    };

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setLoading(true);
        try {
            const { error } = await supabase.from('financial_transactions').insert({
                description: formData.description,
                value: parseFloat(formData.value) || 0,
                type: formData.type,
                entity: formData.entity,
                date: formData.date,
                category: formData.category,
                status: formData.status,
                project_id: formData.project_id || null,
                user_id: user.id,
            });

            if (error) throw error;

            onSuccess();
            onClose();
            // Reset form
            setFormData({
                description: '',
                value: '',
                type: initialType,
                entity: '',
                date: new Date().toISOString().split('T')[0],
                category: '',
                status: 'PAID',
                project_id: '',
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
            <div className="w-full max-w-lg rounded-2xl bg-surface-dark border border-white/10 shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
                    <h2 className="text-xl font-bold text-white">
                        {formData.type === 'INCOME' ? 'Nova Venda' : 'Nova Despesa'}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Type Toggle */}
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
                            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5 font-bold">Valor (R$)</label>
                            <input
                                type="number"
                                step="0.01"
                                required
                                value={formData.value}
                                onChange={e => setFormData({ ...formData, value: e.target.value })}
                                className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-primary outline-none"
                                placeholder="0,00"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5 font-bold">Data</label>
                            <input
                                type="date"
                                required
                                value={formData.date}
                                onChange={e => setFormData({ ...formData, date: e.target.value })}
                                className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-primary outline-none"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5 font-bold">
                                {formData.type === 'INCOME' ? 'Cliente' : 'Fornecedor'}
                            </label>
                            <input
                                type="text"
                                value={formData.entity}
                                onChange={e => setFormData({ ...formData, entity: e.target.value })}
                                className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-primary outline-none"
                                placeholder="Nome da empresa/pessoa"
                            />
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
