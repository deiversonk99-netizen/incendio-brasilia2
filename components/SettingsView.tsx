
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from './PageHeader';

interface UserProfile {
    id: string | null;
    email: string;
    role: 'ADMIN' | 'MANAGER' | 'USER' | 'FUNCIONARIO';
    permissions: any;
}

interface TaskBoard {
    id: string;
    name: string;
    user_id?: string;
}

const SettingsView: React.FC = () => {
    const { user, profile } = useAuth();
    const [activeTab, setActiveTab] = useState<'users' | 'pdf' | 'terms'>('users');
    const [profiles, setProfiles] = useState<UserProfile[]>([]);
    const [taskBoards, setTaskBoards] = useState<TaskBoard[]>([]);

    // Terms Management State
    const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
    const [executionSchedules, setExecutionSchedules] = useState<any[]>([]);
    const [termsTab, setTermsTab] = useState<'payment' | 'schedule'>('payment');
    const [termToEdit, setTermToEdit] = useState<{ id: string; label: string } | null>(null);
    const [newTermLabel, setNewTermLabel] = useState('');
    const [savingTerm, setSavingTerm] = useState(false);
    const [pdfSettings, setPdfSettings] = useState<any>({
        validity_days: 10,
        footer_text: 'Incêndio Brasília - Gestão de Tecnologias de Segurança',
        show_logo: true
    });
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [isPermModalOpen, setIsPermModalOpen] = useState(false);
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserRole, setNewUserRole] = useState<'ADMIN' | 'MANAGER' | 'USER' | 'FUNCIONARIO'>('USER');
    const [tempPerms, setTempPerms] = useState<any>({});

    const allTabs = [
        { id: 'DASHBOARD', label: 'Dashboard' },
        { id: 'CLIENTS', label: 'Clientes' },
        { id: 'TASKS', label: 'Tarefas' },
        { id: 'KITS', label: 'Config. Infra (Kits)' },
        { id: 'CATALOG', label: 'Catálogo Produtos' },
        { id: 'SUPPLIERS', label: 'Fornecedores' },
        { id: 'PLACAS', label: 'Gestão de Placas' },
        { id: 'STOCK', label: 'Gestão de Depósito' },
        { id: 'SERVICES', label: 'Catálogo Serviços' },
        { id: 'SERVICE_MODELS', label: 'Kits & Composições' },
        { id: 'ENG_A', label: 'Fase A - Levantamento' },
        { id: 'ENG_B', label: 'Fase B - Composição' },
        { id: 'ENG_C', label: 'Fase C - Proposta' },
        { id: 'RENEWALS', label: 'Controle de Renovação' },
        { id: 'FINANCE', label: 'Financeiro (Global)' },
        { id: 'SETTINGS', label: 'Configurações do Sistema' }
    ];

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            // 1. Fetch User Profiles - Order by email
            const { data: profileData } = await supabase
                .from('user_profiles')
                .select('*')
                .order('email');

            if (profileData) setProfiles(profileData);

            // Fetch Task Boards for Permissions
            const { data: boardsData } = await supabase
                .from('task_boards')
                .select('id, name, user_id')
                .order('name');

            if (boardsData) setTaskBoards(boardsData as any);

            // 2. Fetch PDF Settings
            const { data: appData, error: appError } = await supabase.from('app_settings').select('*').eq('key', 'pdf_global_config').maybeSingle();
            if (appData) setPdfSettings(appData.value);

            // 3. Fetch Terms
            const { data: pmData, error: pmError } = await supabase.from('payment_methods').select('*').order('label');
            if (pmData) setPaymentMethods(pmData);

            const { data: esData, error: esError } = await supabase.from('execution_schedules').select('*').order('label');
            if (esData) setExecutionSchedules(esData);
        } catch (err) {
            console.error("Error fetching settings:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateRole = async (email: string, newRole: string) => {
        const { error } = await supabase.from('user_profiles').update({ role: newRole }).eq('email', email);
        if (!error) {
            setProfiles(prev => prev.map(p => p.email === email ? { ...p, role: newRole as any } : p));
        } else {
            alert('Erro ao atualizar papel: ' + error.message);
        }
    };

    const handleSavePdfSettings = async () => {
        const { error } = await supabase.from('app_settings').upsert({
            key: 'pdf_global_config',
            value: pdfSettings
        }, { onConflict: 'key' });

        if (!error) alert('Configurações de PDF salvas com sucesso!');
    };

    const handleOpenPermissionModal = (user: UserProfile) => {
        setSelectedUser(user);

        // Populate tempPerms with explicit values to avoid 'undefined' fallback issues
        const initialPerms: any = {};
        allTabs.forEach(tab => {
            if (user.permissions && user.permissions[tab.id] !== undefined) {
                initialPerms[tab.id] = user.permissions[tab.id];
            } else {
                // Default based on current role if not explicitly set
                if (user.role === 'ADMIN' || user.role === 'MANAGER') {
                    // Admin/Manager: All tabs ON by default
                    initialPerms[tab.id] = true;
                } else if (user.role === 'FUNCIONARIO') {
                    // Funcionario: Only default PLACAS/STOCK if not specified
                    initialPerms[tab.id] = (tab.id === 'PLACAS' || tab.id === 'STOCK');
                } else {
                    // USER role defaults:
                    // Only standard engineering/client views.
                    // STOCK/PLACAS/SUPPLIERS should be FALSE by default unless explicitly true.
                    initialPerms[tab.id] = (tab.id.startsWith('ENG_') || tab.id === 'CLIENTS' || tab.id === 'CATALOG');
                }
            }
        });

        // Initialize Task Board Permissions
        taskBoards.forEach(board => {
            const key = `BOARD_${board.id}`;
            if (user.permissions && user.permissions[key] !== undefined) {
                initialPerms[key] = user.permissions[key];
            } else {
                // Default logic
                if (user.role === 'ADMIN' || user.role === 'MANAGER') {
                    initialPerms[key] = true;
                } else if (board.user_id === user.id) {
                    initialPerms[key] = true;
                } else {
                    initialPerms[key] = false;
                }
            }
        });

        setTempPerms(initialPerms);
        setIsPermModalOpen(true);
    };

    const handleAddUser = async () => {
        if (!newUserEmail) return;
        const { error } = await supabase.from('user_profiles').insert([{
            email: newUserEmail,
            role: newUserRole,
            permissions: {}
        }]);

        if (!error) {
            alert('Usuário autorizado com sucesso!\n\nIMPORTANTE: Informe ao usuário que ele deve acessar a tela de Login, clicar em "Não tem conta? Crie uma agora" e informar este mesmo e-mail para criar sua senha de acesso.');
            setIsAddUserModalOpen(false);
            setNewUserEmail('');
            fetchSettings();
        } else {
            alert('Erro ao adicionar: ' + error.message);
        }
    };

    const handleDeleteUser = async (email: string) => {
        if (!confirm(`Deseja realmente remover o acesso de ${email}?`)) return;
        const { error } = await supabase.from('user_profiles').delete().eq('email', email);
        if (!error) {
            setProfiles(prev => prev.filter(p => p.email !== email));
        } else {
            alert('Erro ao excluir: ' + error.message);
        }
    };

    const handleSavePermissions = async () => {
        if (!selectedUser) return;
        const { error } = await supabase
            .from('user_profiles')
            .update({ permissions: tempPerms })
            .eq('email', selectedUser.email);

        if (!error) {
            setProfiles(prev => prev.map(p => p.email === selectedUser.email ? { ...p, permissions: tempPerms } : p));
            setIsPermModalOpen(false);
            alert('Permissões atualizadas com sucesso!');
        } else {
            alert('Erro ao salvar permissões: ' + error.message);
        }
    };

    const handleSaveTerm = async () => {
        if (!newTermLabel.trim()) return;
        setSavingTerm(true);
        const table = termsTab === 'payment' ? 'payment_methods' : 'execution_schedules';

        try {
            console.log(`SettingsView: Saving term to ${table}:`, newTermLabel);
            if (termToEdit) {
                const { error } = await supabase
                    .from(table)
                    .update({ label: newTermLabel })
                    .eq('id', termToEdit.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from(table)
                    .insert([{ label: newTermLabel, active: true }]);
                if (error) throw error;
            }

            setNewTermLabel('');
            setTermToEdit(null);
            
            // Refresh specific list
            const { data, error: fetchError } = await supabase.from(table).select('*').order('label');
            if (fetchError) throw fetchError;
            
            if (termsTab === 'payment') setPaymentMethods(data || []);
            else setExecutionSchedules(data || []);
            
            alert('Salvo com sucesso!');
        } catch (err: any) {
            console.error('SettingsView: Erro ao salvar termo:', err);
            alert('Erro ao salvar: ' + (err.message || 'Erro desconhecido'));
        } finally {
            setSavingTerm(false);
        }
    };

    const handleDeleteTerm = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir este item?')) return;
        const table = termsTab === 'payment' ? 'payment_methods' : 'execution_schedules';
        try {
            console.log(`SettingsView: Deleting term from ${table}:`, id);
            const { error } = await supabase.from(table).delete().eq('id', id);
            if (error) throw error;

            // Refresh specific list
            const { data, error: fetchError } = await supabase.from(table).select('*').order('label');
            if (fetchError) throw fetchError;
            
            if (termsTab === 'payment') setPaymentMethods(data || []);
            else setExecutionSchedules(data || []);
            
            alert('Excluído com sucesso!');
        } catch (err: any) {
            console.error('SettingsView: Erro ao excluir termo:', err);
            alert('Erro ao excluir: ' + (err.message || 'Erro desconhecido'));
        }
    };

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-background-dark">
            <div className="mx-auto max-w-5xl flex flex-col gap-8">
                <PageHeader
                    title="Configurações do Sistema"
                    subtitle="Gerencie usuários, permissões e parâmetros globais do sistema."
                />

                {/* Tabs */}
                <div className="flex border-b border-white/10 gap-4 md:gap-8 overflow-x-auto">
                    {[
                        { id: 'users', label: 'Usuários e Acessos', icon: 'group' },
                        { id: 'pdf', label: 'Configurações de PDF', icon: 'picture_as_pdf' },
                        { id: 'terms', label: 'Termos e Condições', icon: 'gavel' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 pb-4 transition-all relative ${activeTab === tab.id ? 'text-primary' : 'text-slate-400 hover:text-white'}`}
                        >
                            <span className="material-symbols-outlined text-[20px]">{tab.icon}</span>
                            <span className="font-bold text-sm uppercase tracking-wider">{tab.label}</span>
                            {activeTab === tab.id && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary"></div>}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">

                        {/* User Access Tab */}
                        {activeTab === 'users' && (
                            <div className="space-y-6">
                                <div className="flex justify-between items-center bg-surface-dark border border-white/5 p-4 rounded-xl">
                                    <h3 className="text-white font-bold flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary">manage_accounts</span>
                                        Lista de Usuários Autorizados
                                    </h3>
                                    <button
                                        onClick={() => setIsAddUserModalOpen(true)}
                                        className="bg-primary hover:bg-primary-dark text-white text-xs font-black uppercase px-4 py-2 rounded-lg transition-all flex items-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">person_add</span>
                                        Novo Usuário
                                    </button>
                                </div>

                                <div className="bg-surface-dark border border-white/5 rounded-xl overflow-x-auto shadow-xl">
                                    <table className="w-full text-left text-sm min-w-[500px]">
                                        <thead className="bg-white/5 text-slate-400 font-bold uppercase text-[11px] tracking-widest">
                                            <tr>
                                                <th className="px-6 py-4">Usuário</th>
                                                <th className="px-6 py-4 text-center">Nível de Acesso</th>
                                                <th className="px-6 py-4 text-right">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5 text-white">
                                            {profiles.length === 0 && (
                                                <tr>
                                                    <td colSpan={3} className="px-6 py-10 text-center text-slate-500 italic">Nenhum perfil de usuário configurado no banco de dados.</td>
                                                </tr>
                                            )}
                                            {profiles.map(profile => (
                                                <tr key={profile.email} className="hover:bg-white/2 transition-colors">
                                                    <td className="px-6 py-4 font-medium">{profile.email}</td>
                                                    <td className="px-6 py-4">
                                                        <select
                                                            value={profile.role}
                                                            onChange={(e) => handleUpdateRole(profile.email, e.target.value)}
                                                            className="bg-background-dark border border-white/10 rounded px-2 py-1 text-xs outline-none focus:border-primary"
                                                        >
                                                            <option value="USER">Usuário Comum</option>
                                                            <option value="FUNCIONARIO">Operação/Funcionário</option>
                                                            <option value="MANAGER">Gerente de Projetos</option>
                                                            <option value="ADMIN">Administrador Central</option>
                                                        </select>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-4">
                                                            <button
                                                                onClick={() => handleOpenPermissionModal(profile)}
                                                                className="text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all"
                                                            >
                                                                Visibilidade
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteUser(profile.email)}
                                                                className="text-rose-500 hover:bg-rose-500/10 p-1.5 rounded-lg transition-all"
                                                                title="Remover Usuário"
                                                            >
                                                                <span className="material-symbols-outlined text-[18px]">delete</span>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="bg-blue-900/10 border border-blue-500/20 p-4 rounded-lg flex gap-3 text-blue-200 text-xs leading-relaxed">
                                    <span className="material-symbols-outlined text-blue-400">info</span>
                                    <p>Administradores centrais têm acesso total. Gerentes podem editar projetos mas não acessam o financeiro global. Usuários comuns têm apenas visualização conforme atribuído.</p>
                                </div>
                            </div>
                        )}

                        {/* PDF Settings Tab */}
                        {activeTab === 'pdf' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="bg-surface-dark border border-white/5 p-8 rounded-xl flex flex-col gap-6 shadow-xl">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary">description</span>
                                        Parâmetros da Proposta
                                    </h3>

                                    <div className="space-y-4">
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Validade Padrão (Dias)</label>
                                            <input
                                                type="number"
                                                value={pdfSettings.validity_days}
                                                onChange={(e) => setPdfSettings({ ...pdfSettings, validity_days: e.target.value })}
                                                className="bg-background-dark border border-white/10 rounded-lg p-3 text-white focus:border-primary outline-none"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Texto de Rodapé Padrão</label>
                                            <textarea
                                                rows={3}
                                                value={pdfSettings.footer_text}
                                                onChange={(e) => setPdfSettings({ ...pdfSettings, footer_text: e.target.value })}
                                                className="bg-background-dark border border-white/10 rounded-lg p-3 text-white focus:border-primary outline-none resize-none"
                                            />
                                            <p className="text-[10px] text-slate-500 italic mt-1">Este texto será usado como padrão em todos os PDFs (Propostas e Composições), a menos que seja alterado individualmente em um projeto.</p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleSavePdfSettings}
                                        className="mt-4 bg-primary text-white font-bold py-3 rounded-lg hover:bg-primary-dark transition-all shadow-lg shadow-primary/20"
                                    >
                                        Salvar Configurações Globais
                                    </button>
                                </div>

                                <div className="bg-surface-dark border border-white/5 p-8 rounded-xl flex flex-col gap-6 shadow-xl">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary">imagesmode</span>
                                        Identidade Visual no PDF
                                    </h3>

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/5">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-white">Logotipo na Primeira Página</span>
                                                <span className="text-xs text-slate-400">Exibir logo da Incêndio Brasília</span>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={pdfSettings.show_logo}
                                                onChange={(e) => setPdfSettings({ ...pdfSettings, show_logo: e.target.checked })}
                                                className="size-5 rounded border-white/10 bg-white/5 text-primary accent-primary"
                                            />
                                        </div>
                                    </div>

                                    <div className="p-4 rounded-lg border border-dashed border-white/10 text-center py-10">
                                        <span className="material-symbols-outlined text-[40px] text-slate-600 mb-2">cloud_upload</span>
                                        <p className="text-xs text-slate-500">Alterar imagem padrão do logotipo</p>
                                        <button className="mt-4 text-xs font-bold text-primary hover:underline">Selecionar Arquivo</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Terms Tab */}
                        {activeTab === 'terms' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="bg-surface-dark border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
                                    <div className="flex bg-black/40 p-1 border-b border-white/5">
                                        <button
                                            onClick={() => {
                                                setTermsTab('payment');
                                                setTermToEdit(null);
                                                setNewTermLabel('');
                                            }}
                                            className={`flex-1 py-3 text-xs font-black uppercase tracking-[0.2em] rounded-xl transition-all ${termsTab === 'payment' ? 'bg-primary text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            Formas de Pagamento
                                        </button>
                                        <button
                                            onClick={() => {
                                                setTermsTab('schedule');
                                                setTermToEdit(null);
                                                setNewTermLabel('');
                                            }}
                                            className={`flex-1 py-3 text-xs font-black uppercase tracking-[0.2em] rounded-xl transition-all ${termsTab === 'schedule' ? 'bg-primary text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            Cronogramas
                                        </button>
                                    </div>

                                    <div className="p-8 space-y-8">
                                        <div className="flex gap-4">
                                            <div className="flex-1 relative">
                                                <input
                                                    type="text"
                                                    className="w-full bg-background-dark border border-white/10 rounded-2xl px-6 py-4 text-white outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-lg font-medium"
                                                    placeholder={termsTab === 'payment' ? "Ex: 50% Entrada + 50% Entrega" : "Ex: 15 dias úteis"}
                                                    value={newTermLabel}
                                                    onChange={e => setNewTermLabel(e.target.value)}
                                                />
                                            </div>
                                            <button
                                                onClick={handleSaveTerm}
                                                disabled={!newTermLabel.trim() || savingTerm}
                                                className="bg-primary hover:bg-primary-dark text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-xl shadow-primary/20 disabled:opacity-50 active:scale-95"
                                            >
                                                {termToEdit ? 'Salvar' : 'Adicionar'}
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 gap-3">
                                            {(termsTab === 'payment' ? paymentMethods : executionSchedules).map((item: any) => (
                                                <div key={item.id} className="group flex items-center justify-between p-4 bg-white/[0.03] border border-white/5 rounded-2xl hover:bg-white/[0.06] hover:border-white/10 transition-all">
                                                    <span className="text-white font-medium text-lg pl-2">{item.label}</span>
                                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                                                        <button
                                                            onClick={() => {
                                                                setTermToEdit(item);
                                                                setNewTermLabel(item.label);
                                                            }}
                                                            className="size-10 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-all"
                                                            title="Editar"
                                                        >
                                                            <span className="material-symbols-outlined text-[20px]">edit</span>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteTerm(item.id)}
                                                            className="size-10 flex items-center justify-center bg-rose-500/5 hover:bg-rose-500/10 rounded-xl text-rose-500 transition-all"
                                                            title="Excluir"
                                                        >
                                                            <span className="material-symbols-outlined text-[20px]">delete</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {(termsTab === 'payment' ? paymentMethods : executionSchedules).length === 0 && (
                                                <div className="py-20 text-center">
                                                    <span className="material-symbols-outlined text-slate-800 text-6xl mb-4">inventory_2</span>
                                                    <p className="text-slate-500 font-bold uppercase tracking-widest">Nenhum item configurado</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                )}
            </div>

            {/* Permission Modal */}
            {isPermModalOpen && selectedUser && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                    <div className="bg-surface-dark border border-white/10 rounded-2xl p-8 w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-white uppercase tracking-wider">Permissões de Acesso</h2>
                                <p className="text-sm text-slate-400 mt-1">{selectedUser.email}</p>
                            </div>
                            <button onClick={() => setIsPermModalOpen(false)} className="text-slate-400 hover:text-white">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 max-h-[60vh] overflow-y-auto pr-4 custom-scrollbar mb-8">
                            <h3 className="col-span-2 text-xs font-black text-primary uppercase tracking-[0.2em] mb-2 border-b border-white/5 pb-2 mt-2">Módulos do Sistema</h3>
                            {allTabs.map(tab => (
                                <div key={tab.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                                    <span className="text-sm font-medium text-slate-200">{tab.label}</span>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={tempPerms[tab.id] ?? false}
                                            onChange={(e) => setTempPerms({ ...tempPerms, [tab.id]: e.target.checked })}
                                        />
                                        <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                    </label>
                                </div>
                            ))}

                            {/* Task Boards Permissions */}
                            <h3 className="col-span-2 text-xs font-black text-primary uppercase tracking-[0.2em] mb-2 border-b border-white/5 pb-2 mt-6">
                                Acesso aos Quadros de Tarefas
                            </h3>
                            {taskBoards.length === 0 && <p className="col-span-2 text-slate-500 text-xs italic">Nenhum quadro de tarefas encontrado.</p>}
                            {taskBoards.map(board => {
                                const permKey = `BOARD_${board.id}`;
                                return (
                                    <div key={board.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                                        <div className="flex items-center gap-3">
                                            <div className="size-8 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30 text-primary">
                                                <span className="material-symbols-outlined text-[18px]">view_kanban</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-slate-200 uppercase">{board.name}</span>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={tempPerms[permKey] ?? false}
                                                onChange={(e) => setTempPerms({ ...tempPerms, [permKey]: e.target.checked })}
                                            />
                                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                        </label>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex gap-4 pt-4 border-t border-white/10">
                            <button
                                onClick={() => setIsPermModalOpen(false)}
                                className="flex-1 py-3 border border-white/10 rounded-xl text-slate-300 font-bold hover:bg-white/5 transition-all text-sm uppercase tracking-widest"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSavePermissions}
                                className="flex-1 py-3 bg-primary hover:bg-primary-dark rounded-xl text-white font-bold shadow-lg shadow-primary/20 transition-all text-sm uppercase tracking-widest"
                            >
                                Salvar Permissões
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Add User Modal */}
            {isAddUserModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                    <div className="bg-surface-dark border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-white uppercase tracking-wider">Novo Usuário</h2>
                            <button onClick={() => setIsAddUserModalOpen(false)} className="text-slate-400 hover:text-white">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">E-mail de Acesso</label>
                                <input
                                    type="email"
                                    placeholder="exemplo@email.com"
                                    value={newUserEmail}
                                    onChange={(e) => setNewUserEmail(e.target.value)}
                                    className="bg-background-dark border border-white/10 rounded-lg p-3 text-white focus:border-primary outline-none"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nível de Acesso (Base)</label>
                                <select
                                    value={newUserRole}
                                    onChange={(e) => setNewUserRole(e.target.value as any)}
                                    className="bg-background-dark border border-white/10 rounded-lg p-3 text-white focus:border-primary outline-none"
                                >
                                    <option value="USER">Usuário Comum</option>
                                    <option value="FUNCIONARIO">Operação/Funcionário</option>
                                    <option value="MANAGER">Gerente de Projetos</option>
                                    <option value="ADMIN">Administrador Central</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-4 pt-8">
                            <button
                                onClick={() => setIsAddUserModalOpen(false)}
                                className="flex-1 py-3 border border-white/10 rounded-xl text-slate-300 font-bold hover:bg-white/5 transition-all text-sm uppercase"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleAddUser}
                                className="flex-1 py-3 bg-primary hover:bg-primary-dark rounded-xl text-white font-bold shadow-lg shadow-primary/20 transition-all text-sm uppercase"
                            >
                                Adicionar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SettingsView;
