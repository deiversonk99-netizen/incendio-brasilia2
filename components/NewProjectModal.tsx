import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

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
        type: 'business',
    });
    const [availableServices, setAvailableServices] = useState<any[]>([]);
    const [selectedServices, setSelectedServices] = useState<string[]>([]);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchClients();
            fetchServices();
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

    const fetchServices = async () => {
        const { data } = await supabase.from('services_catalog').select('*').order('name');
        if (data) setAvailableServices(data);
    };

    const toggleService = (id: string) => {
        setSelectedServices(prev =>
            prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
        );
    };

    const handleSelectClient = (name: string) => {
        setFormData({ ...formData, client: name });
        setClientSearch(name);
        setIsDropdownOpen(false);
    };

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

            let blueprint_url = '';

            if (selectedFile) {
                const fileExt = selectedFile.name.split('.').pop();
                const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
                const filePath = `${user.id}/${fileName}`;

                const { error: uploadError, data: uploadData } = await supabase.storage
                    .from('project-files')
                    .upload(filePath, selectedFile);

                if (uploadError) throw uploadError;

                if (uploadData) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('project-files')
                        .getPublicUrl(filePath);
                    blueprint_url = publicUrl;
                }
            }

            const { data: newProject, error } = await supabase.from('projects').insert({
                name: formData.name,
                client: formData.client,
                value: 0,
                deadline: null,
                type: formData.type,
                status: 'ANALYSIS',
                user_id: user.id,
                blueprint_url: blueprint_url || null,
            }).select().single();

            if (error) throw error;

            if (newProject && selectedServices.length > 0) {
                const serviceAssociations = selectedServices.map(serviceId => ({
                    project_id: newProject.id,
                    service_id: serviceId
                }));
                const { error: serviceError } = await supabase
                    .from('project_services')
                    .insert(serviceAssociations);
                if (serviceError) console.error('Error saving project services:', serviceError);
            }

            onSuccess();
            onClose();
            setFormData({ name: '', client: '', type: 'business' });
            setSelectedFile(null);
            setClientSearch('');
            setSelectedServices([]);
        } catch (error) {
            console.error('Error creating project:', error);
            alert('Erro ao criar projeto');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const filteredClients = clients.filter(c =>
        c.toLowerCase().includes(clientSearch.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-2xl bg-surface-dark border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
                <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5 shrink-0">
                    <h2 className="text-xl font-bold text-white">Novo Projeto</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
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

                        <div className="space-y-2">
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Serviços do Projeto</label>
                            <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto bg-background-dark border border-white/10 rounded-lg p-3">
                                {availableServices.map(service => (
                                    <label key={service.id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors group">
                                        <input
                                            type="checkbox"
                                            checked={selectedServices.includes(service.id)}
                                            onChange={() => toggleService(service.id)}
                                            className="w-4 h-4 rounded border-white/20 bg-black/40 text-primary focus:ring-primary accent-primary"
                                        />
                                        <span className="text-sm text-slate-300 group-hover:text-white transition-colors">{service.name}</span>
                                    </label>
                                ))}
                                {availableServices.length === 0 && (
                                    <div className="text-xs text-slate-500 italic p-2 text-center">Nenhum serviço disponível no catálogo</div>
                                )}
                            </div>
                        </div>

                        <div className="bg-white/5 p-4 rounded-xl border border-white/10 space-y-3">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                                Planta ou Documento (Opcional)
                            </label>
                            <div className="relative group">
                                <input
                                    type="file"
                                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                    className="hidden"
                                    id="file-upload"
                                    accept=".pdf,image/*,.dwg"
                                />
                                <label
                                    htmlFor="file-upload"
                                    className={`flex items-center justify-center gap-3 w-full rounded-lg border border-dashed px-4 py-8 transition-all cursor-pointer ${selectedFile
                                        ? 'bg-primary/10 border-primary text-primary'
                                        : 'bg-background-dark border-white/20 text-slate-400 hover:border-white/40 hover:text-white'
                                        }`}
                                >
                                    <span className="material-symbols-outlined text-3xl">
                                        {selectedFile ? 'check_circle' : 'upload_file'}
                                    </span>
                                    <div className="text-left">
                                        <p className="text-sm font-bold uppercase tracking-tight">
                                            {selectedFile ? 'Arquivo Selecionado' : 'Carregar Planta/Arquivo'}
                                        </p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {selectedFile ? selectedFile.name : 'PDF, Imagens ou DWG'}
                                        </p>
                                    </div>
                                </label>
                                {selectedFile && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedFile(null)}
                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 shadow-xl"
                                    >
                                        <span className="material-symbols-outlined text-sm">close</span>
                                    </button>
                                )}
                            </div>
                        </div>

                    </div>

                    <div className="p-6 border-t border-white/10 bg-white/5 shrink-0 flex gap-3">
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
