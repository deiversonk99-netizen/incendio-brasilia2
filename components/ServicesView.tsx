
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from './PageHeader';

const ServicesView: React.FC = () => {
    const [services, setServices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingService, setEditingService] = useState<any>(null);
    const [formData, setFormData] = useState({ name: '', description: '' });

    useEffect(() => {
        fetchServices();
    }, []);

    const fetchServices = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('services_catalog')
            .select('*')
            .order('name');

        if (data) setServices(data);
        setLoading(false);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const payload = {
            name: formData.name,
            description: formData.description
        };

        if (editingService) {
            const { error } = await supabase
                .from('services_catalog')
                .update(payload)
                .eq('id', editingService.id);
            if (error) alert('Erro ao atualizar: ' + error.message);
        } else {
            const { error } = await supabase
                .from('services_catalog')
                .insert(payload);
            if (error) alert('Erro ao criar: ' + error.message);
        }

        setIsModalOpen(false);
        setEditingService(null);
        setFormData({ name: '', description: '' });
        fetchServices();
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir este serviço?')) return;

        const { error } = await supabase
            .from('services_catalog')
            .delete()
            .eq('id', id);

        if (error) alert('Erro ao excluir: ' + error.message);
        fetchServices();
    };

    const openEdit = (service: any) => {
        setEditingService(service);
        setFormData({ name: service.name, description: service.description || '' });
        setIsModalOpen(true);
    };

    const filteredServices = services.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.description && s.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <PageHeader
                title="Catálogo de Serviços"
                subtitle="Gerencie a lista de serviços oferecidos pela empresa."
                actions={
                    <button
                        onClick={() => { setEditingService(null); setFormData({ name: '', description: '' }); setIsModalOpen(true); }}
                        className="btn-primary flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition-colors"
                    >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                        Novo Serviço
                    </button>
                }
            />

            <div className="flex-1 overflow-hidden flex flex-col p-4 md:p-6">
                <div className="mb-6 relative max-w-md">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">search</span>
                    <input
                        type="text"
                        placeholder="Buscar serviços..."
                        className="w-full bg-surface-dark border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white outline-none focus:border-emerald-500 transition-all shadow-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex-1 overflow-auto bg-surface-dark border border-white/5 rounded-2xl shadow-xl">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-black/20 text-slate-400 font-bold uppercase text-xs sticky top-0 z-10 shadow-sm border-b border-white/5">
                            <tr>
                                <th className="px-6 py-4">Serviço</th>
                                <th className="px-6 py-4">Descrição</th>
                                <th className="px-6 py-4 w-28 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredServices.map(service => (
                                <tr key={service.id} className="hover:bg-white/5 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-white text-sm">{service.name}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-slate-400 text-xs line-clamp-2 max-w-2xl">{service.description || '-'}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => openEdit(service)} className="p-1.5 hover:bg-white/10 rounded-lg text-amber-400" title="Editar">
                                                <span className="material-symbols-outlined text-[20px]">edit</span>
                                            </button>
                                            <button onClick={() => handleDelete(service.id)} className="p-1.5 hover:bg-white/10 rounded-lg text-rose-400" title="Excluir">
                                                <span className="material-symbols-outlined text-[20px]">delete</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredServices.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={3} className="px-6 py-12 text-center text-slate-500 italic">
                                        Nenhum serviço encontrado.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal de Criação/Edição */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                    <div className="bg-surface-dark border border-white/10 rounded-2xl p-8 w-full max-w-lg shadow-2xl">
                        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <span className="material-symbols-outlined text-emerald-500">settings_suggest</span>
                            {editingService ? 'Editar Serviço' : 'Novo Serviço'}
                        </h3>
                        <form onSubmit={handleSave} className="space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2 tracking-wider">Nome do Serviço</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500 transition-all"
                                    placeholder="Ex: Manutenção Preventiva Alarme"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2 tracking-wider">Descrição Detalhada</label>
                                <textarea
                                    rows={6}
                                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500 transition-all resize-none"
                                    placeholder="Detalhe os procedimentos do serviço..."
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 py-3 border border-white/10 rounded-xl text-slate-300 font-bold hover:bg-white/5 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 rounded-xl text-white font-bold shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition-all"
                                >
                                    {loading ? 'Salvando...' : 'Salvar Serviço'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ServicesView;
