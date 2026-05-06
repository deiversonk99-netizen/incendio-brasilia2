import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Project } from '../types';
import PageHeader from './PageHeader';
import NewClientModal from './NewClientModal';
import { getClientDisplayName } from '../lib/formatters';


interface ClientEntry {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    client_type?: string;
    fantasy_name?: string;
    cnpj?: string;
}

interface ClientStats {
    clientName: string;
    totalProjects: number;
    pendingProjects: number;
    completedProjects: number;
    totalCompletedValue: number;
    projects: Project[];
    details?: ClientEntry;
}

const ClientsView: React.FC = () => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [clients, setClients] = useState<ClientEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isNewClientModalOpen, setIsNewClientModalOpen] = useState(false);

    const [editingClient, setEditingClient] = useState<ClientEntry | null>(null);

    const fetchData = async () => {
        setLoading(true);
        const [projRes, clientRes] = await Promise.all([
            supabase.from('projects').select('*').order('created_at', { ascending: false }),
            supabase.from('clients').select('*').order('name')
        ]);

        if (projRes.data) setProjects(projRes.data as Project[]);
        if (clientRes.data) setClients(clientRes.data as ClientEntry[]);
        setLoading(false);
    };

    const handleDeleteClient = async (id: string, name: string) => {
        if (!confirm(`Tem certeza que deseja excluir o cliente "${name}"? Esta ação não pode ser desfeita.`)) return;

        const { error } = await supabase.from('clients').delete().eq('id', id);
        if (error) {
            alert('Erro ao excluir cliente: ' + error.message);
        } else {
            fetchData();
        }
    };

    const handleEditClient = (client: ClientEntry) => {
        setEditingClient(client);
        setIsNewClientModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsNewClientModalOpen(false);
        setEditingClient(null);
    };

    useEffect(() => {
        fetchData();
    }, []);

    const clientGroups = useMemo(() => {
        const groups: Record<string, ClientStats> = {};

        // Initialize groups with all known clients from the 'clients' table
        clients.forEach(client => {
            const key = client.name.toLowerCase();
            groups[key] = {
                clientName: client.name,
                totalProjects: 0,
                pendingProjects: 0,
                completedProjects: 0,
                totalCompletedValue: 0,
                projects: [],
                details: client
            };
        });

        // Add stats from projects
        projects.forEach(project => {
            const clientName = (project.client || 'Sem Cliente').trim();
            const clientKey = clientName.toLowerCase();

            if (!groups[clientKey]) {
                groups[clientKey] = {
                    clientName: clientName,
                    totalProjects: 0,
                    pendingProjects: 0,
                    completedProjects: 0,
                    totalCompletedValue: 0,
                    projects: []
                };
            }

            groups[clientKey].totalProjects += 1;
            groups[clientKey].projects.push(project);

            if (project.status === 'DONE') {
                groups[clientKey].completedProjects += 1;
                groups[clientKey].totalCompletedValue += Number(project.value || 0);
            } else {
                groups[clientKey].pendingProjects += 1;
            }
        });

        return Object.values(groups).sort((a, b) => b.totalProjects - a.totalProjects);
    }, [projects, clients]);

    const filteredClients = clientGroups.filter(client =>
        client.clientName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="mx-auto max-w-[1600px] flex flex-col gap-8 pb-12">
                <PageHeader
                    title={
                        <div className="flex items-center gap-3">
                            <span className="italic">Gestão de Clientes</span>
                            {!loading && (
                                <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-1 rounded-full border border-primary/20 tracking-widest italic uppercase">
                                    {clients.length} Clientes
                                </span>
                            )}
                        </div>
                    }
                    subtitle="Visualize sua base de clientes e o histórico de cada um"
                    actions={
                        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                            <div className="relative w-full md:w-auto">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[20px]">search</span>
                                <input
                                    type="text"
                                    placeholder="Buscar cliente..."
                                    className="bg-surface-dark border border-white/10 text-white text-sm rounded-lg block w-full md:w-64 pl-10 pr-3 py-2 outline-none focus:border-primary transition-colors"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <button
                                onClick={() => setIsNewClientModalOpen(true)}
                                className="flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white text-sm font-bold rounded-lg transition-all shadow-lg shadow-primary/20 w-full md:w-auto"
                            >
                                <span className="material-symbols-outlined text-[20px]">person_add</span>
                                Novo Cliente
                            </button>
                        </div>
                    }
                />

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {loading ? (
                        Array(4).fill(0).map((_, i) => (
                            <div key={i} className="bg-surface-dark border border-white/5 rounded-2xl p-6 animate-pulse">
                                <div className="h-4 bg-white/10 rounded w-1/2 mb-4"></div>
                                <div className="h-20 bg-white/10 rounded w-full mb-4"></div>
                                <div className="h-10 bg-white/10 rounded w-full"></div>
                            </div>
                        ))
                    ) : filteredClients.length === 0 ? (
                        <div className="col-span-full py-20 text-center flex flex-col items-center gap-4">
                            <span className="material-symbols-outlined text-[64px] text-slate-700">group_off</span>
                            <p className="text-slate-500 italic">Nenhum cliente encontrado.</p>
                            <button
                                onClick={() => setIsNewClientModalOpen(true)}
                                className="text-primary font-bold hover:underline"
                            >
                                Clique aqui para cadastrar seu primeiro cliente
                            </button>
                        </div>
                    ) : (
                        filteredClients.map((client) => (
                            <div key={client.clientName} className="bg-surface-dark border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-all group shadow-xl flex flex-col relative overflow-hidden">
                                <div className="absolute top-4 right-4 flex gap-2 z-10">
                                    {client.details ? (
                                        <>
                                            <button
                                                onClick={() => handleEditClient(client.details!)}
                                                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all border border-white/5"
                                                title="Editar Cliente"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">edit</span>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteClient(client.details!.id, client.details!.name)}
                                                className="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-all border border-red-500/10"
                                                title="Excluir Cliente"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">delete</span>
                                            </button>
                                        </>
                                    ) : (
                                        <div
                                            className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[8px] font-black uppercase tracking-widest"
                                            title="Este cliente existe apenas em projetos e não possui um cadastro completo."
                                        >
                                            Sem Cadastro
                                        </div>
                                    )}
                                </div>

                                <h3 className="text-lg font-black text-white mb-1 group-hover:text-primary transition-colors truncate italic pr-20">
                                    {getClientDisplayName(client.details || { name: client.clientName }, 'ui')}
                                </h3>
                                {client.details && client.details.fantasy_name && client.details.fantasy_name.trim() !== '' && (
                                    <p className="text-[11px] text-primary font-bold italic mb-1 uppercase tracking-tight opacity-70">
                                        {client.details.name}
                                    </p>
                                )}
                                {client.details?.cnpj && (
                                    <p className="text-[10px] text-slate-400 italic mb-1 uppercase tracking-tight">
                                        CNPJ/CPF: {client.details.cnpj}
                                    </p>
                                )}

                                <div className="flex items-center gap-2 mb-4 flex-wrap">
                                    {client.details?.client_type && (
                                        <span className="text-[9px] font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded border border-emerald-500/20">
                                            {client.details.client_type}
                                        </span>
                                    )}
                                    {client.details?.email && (
                                        <p className="text-[10px] text-slate-500 font-bold flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[12px]">mail</span>
                                            {client.details.email}
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-4 flex-1">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="bg-background-dark/50 p-3 rounded-xl border border-white/5">
                                            <span className="text-[9px] uppercase font-black text-slate-500 block mb-1 tracking-widest">Pendentes</span>
                                            <span className="text-xl font-black text-blue-400">{client.pendingProjects}</span>
                                        </div>
                                        <div className="bg-background-dark/50 p-3 rounded-xl border border-white/5">
                                            <span className="text-[9px] uppercase font-black text-slate-500 block mb-1 tracking-widest">Concluídos</span>
                                            <span className="text-xl font-black text-emerald-500">{client.completedProjects}</span>
                                        </div>
                                    </div>

                                    <div className="bg-background-dark/50 p-4 rounded-xl border border-white/5">
                                        <span className="text-[9px] uppercase font-black text-slate-500 block mb-1 tracking-widest">Faturamento Total</span>
                                        <span className="text-lg font-black text-white italic">
                                            R$ {client.totalCompletedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>

                                    <div className="flex-1">
                                        <span className="text-[9px] uppercase font-black text-slate-500 block mb-2 tracking-widest">Histórico de Projetos</span>
                                        <div className="space-y-2 max-h-32 overflow-y-auto pr-1 thin-scroll">
                                            {client.projects.length === 0 ? (
                                                <p className="text-[10px] text-slate-600 italic">Sem projetos vinculados</p>
                                            ) : (
                                                client.projects.map(p => (
                                                    <div key={p.id} className="text-[11px] text-slate-400 py-2 border-b border-white/5 last:border-0 flex justify-between items-center group/item hover:bg-white/5 px-2 rounded-lg transition-colors">
                                                        <span className="truncate flex-1 mr-2 font-bold">{p.name}</span>
                                                        <span className={`text-[8px] px-2 py-0.5 rounded-full font-black tracking-widest uppercase ${p.status === 'DONE' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-primary/10 text-primary border border-primary/20'
                                                            }`}>
                                                            {p.status}
                                                        </span>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <NewClientModal
                isOpen={isNewClientModalOpen}
                onClose={handleCloseModal}
                onSuccess={() => fetchData()}
                client={editingClient}
            />
        </div>
    );
};

export default ClientsView;
