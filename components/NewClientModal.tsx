import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Client {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    notes?: string;
}

interface NewClientModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    client?: Client | null;
}

const NewClientModal: React.FC<NewClientModalProps> = ({ isOpen, onClose, onSuccess, client }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        notes: ''
    });

    React.useEffect(() => {
        if (client) {
            setFormData({
                name: client.name || '',
                email: client.email || '',
                phone: client.phone || '',
                notes: client.notes || ''
            });
        } else {
            setFormData({ name: '', email: '', phone: '', notes: '' });
        }
    }, [client, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setLoading(true);
        try {
            if (client) {
                // Update
                const { error } = await supabase
                    .from('clients')
                    .update(formData)
                    .eq('id', client.id);
                if (error) throw error;
            } else {
                // Insert
                const { error } = await supabase.from('clients').insert({
                    ...formData,
                    user_id: user.id
                });
                if (error) throw error;
            }

            onSuccess();
            onClose();
            setFormData({ name: '', email: '', phone: '', notes: '' });
        } catch (error: any) {
            console.error('Error saving client:', error);
            alert('Erro ao salvar cliente: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl bg-surface-dark border border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
                    <h2 className="text-xl font-bold text-white italic">
                        {client ? 'Editar Cliente' : 'Novo Cliente'}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5 tracking-widest">Nome do Cliente / Empresa *</label>
                        <input
                            type="text"
                            required
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-primary outline-none transition-all"
                            placeholder="Ex: Construtora Alfa"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5 tracking-widest">E-mail</label>
                            <input
                                type="email"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-primary outline-none transition-all"
                                placeholder="contato@empresa.com"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5 tracking-widest">Telefone</label>
                            <input
                                type="tel"
                                value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-primary outline-none transition-all"
                                placeholder="(61) 99999-9999"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5 tracking-widest">Observações</label>
                        <textarea
                            value={formData.notes}
                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                            className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-primary outline-none h-24 resize-none transition-all"
                            placeholder="Informações adicionais..."
                        />
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 rounded-lg border border-white/10 py-3 font-bold text-slate-300 hover:bg-white/5 transition-all text-sm uppercase tracking-widest"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 rounded-lg bg-primary py-3 font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary-dark disabled:opacity-50 transition-all text-sm uppercase tracking-widest"
                        >
                            {loading ? 'Salvando...' : client ? 'Salvar Alterações' : 'Cadastrar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default NewClientModal;
