import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Project } from '../types';

interface NewProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const NewProjectModal: React.FC<NewProjectModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [clients, setClients] = useState<string[]>([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [clientSearch, setClientSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [formData, setFormData] = useState({
        name: '',
        client: '',
        value: '',
        deadline: '',
        type: 'business',
    });

    useEffect(() => {
        if (isOpen) {
            fetchClients();
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchClients = async () => {
        const { data } = await supabase.from('clients').select('name');
        if (data) {
            setClients(data.map(c => c.name).sort());
        }
    };

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setLoading(true);
        try {
            // Check if client exists, if not, create it
            const { data: existingClient } = await supabase
                .from('clients')
                .select('id')
                .eq('name', formData.client)
                .single();

            if (!existingClient && formData.client) {
                await supabase.from('clients').insert({
                    name: formData.client,
                    user_id: user.id
                });
            }

            const { error } = await supabase.from('projects').insert({
                name: formData.name,
                client: formData.client,
                value: parseFloat(formData.value) || 0,
                deadline: formData.deadline,
                type: formData.type,
                status: 'ANALYSIS',
                user_id: user.id,
            });

            if (error) throw error;

            onSuccess();
            onClose();
            setFormData({ name: '', client: '', value: '', deadline: '', type: 'business' });
            setClientSearch('');
        } catch (error) {
            console.error('Error creating project:', error);
            alert('Erro ao criar projeto');
        } finally {
            setLoading(false);
        }
    };

    const filteredClients = clients.filter(c =>
        c.toLowerCase().includes(clientSearch.toLowerCase())
    );

    const handleSelectClient = (name: string) => {
        setFormData({ ...formData, client: name });
        setClientSearch(name);
        setIsDropdownOpen(false);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-2xl bg-surface-dark border border-white/10 shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
                    <h2 className="text-xl font-bold text-white">Novo Projeto</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Nome do Projeto</label>
                        <input
                            type="text"
                            required
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="Ex: Reforma Shopping Norte"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="relative" ref={dropdownRef}>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Cliente</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    required
                                    value={clientSearch}
                                    onChange={e => {
                                        setClientSearch(e.target.value);
                                        setFormData({ ...formData, client: e.target.value });
                                        setIsDropdownOpen(true);
                                    }}
                                    onFocus={() => setIsDropdownOpen(true)}
                                    className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary pr-10"
                                    placeholder="Selecione ou digite..."
                                />
                                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                                    keyboard_arrow_down
                                </span>
                            </div>

                            {isDropdownOpen && (
                                <div className="absolute z-10 w-full mt-1 bg-surface-dark border border-white/10 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                    {filteredClients.length > 0 ? (
                                        filteredClients.map((c, i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                onClick={() => handleSelectClient(c)}
                                                className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-primary/20 hover:text-white transition-colors"
                                            >
                                                {c}
                                            </button>
                                        ))
                                    ) : clientSearch && (
                                        <div className="px-4 py-2 text-sm text-slate-400 italic">
                                            Clique para cadastrar "{clientSearch}"
                                        </div>
                                    )}
                                    {!clientSearch && clients.length === 0 && (
                                        <div className="px-4 py-2 text-sm text-slate-500 italic">Nenhum cliente cadastrado</div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Tipo</label>
                            <select
                                value={formData.type}
                                onChange={e => setFormData({ ...formData, type: e.target.value })}
                                className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                                <option value="business">Comercial</option>
                                <option value="factory">Industrial</option>
                                <option value="store">Varejo</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Valor (R$)</label>
                            <input
                                type="number"
                                step="0.01"
                                required
                                value={formData.value}
                                onChange={e => setFormData({ ...formData, value: e.target.value })}
                                className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                placeholder="0.00"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Prazo</label>
                            <input
                                type="date"
                                required
                                value={formData.deadline}
                                onChange={e => setFormData({ ...formData, deadline: e.target.value })}
                                className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 rounded-lg border border-white/10 py-3 font-semibold text-slate-300 hover:bg-white/5 transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 rounded-lg bg-primary py-3 font-semibold text-white shadow-lg shadow-primary/20 hover:bg-primary-dark disabled:opacity-50 transition-all"
                        >
                            {loading ? 'Criando...' : 'Criar Projeto'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default NewProjectModal;
