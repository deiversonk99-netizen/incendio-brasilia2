
import React from 'react';
import { AppView } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { canViewTab } from '../lib/permissions';

interface SidebarProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange, isOpen, onClose }) => {
  const { signOut, user, profile } = useAuth();

  const allNavItems = [
    { id: AppView.DASHBOARD, label: 'Dashboard', icon: 'dashboard' },
    { id: AppView.CLIENTS, label: 'Clientes', icon: 'person_outline' },
    { id: AppView.TASKS, label: 'Tarefas', icon: 'check_circle' },
    { id: AppView.TEAM_TASKS, label: 'Monitoramento Equipe', icon: 'groups' },
    { id: AppView.ADMIN_BOARDS, label: 'Gerenciar Quadros', icon: 'admin_panel_settings' },
    { id: AppView.KITS, label: 'Infraestruturas', icon: 'dataset' },
    { id: AppView.CATALOG, label: 'Catálogo Produtos', icon: 'inventory_2' },
    { id: AppView.SUPPLIERS, label: 'Fornecedores', icon: 'local_shipping' },
    { id: AppView.PLACAS, label: 'Gestão de Placas', icon: 'warning' },
    { id: AppView.SERVICES, label: 'Catálogo Serviços', icon: 'settings_suggest' },
    { id: AppView.SERVICE_MODELS, label: 'Kits & Composições', icon: 'design_services' },
    { id: AppView.ENGINEERING_PHASE_A, label: 'Fase A - Levantamento', icon: 'architecture' },
    { id: AppView.ENGINEERING_PHASE_B, label: 'Fase B - Composição', icon: 'dataset_linked' },
    { id: AppView.ENGINEERING_PHASE_C, label: 'Fase C - Proposta', icon: 'description' },
    { id: AppView.RENEWALS, label: 'Controle de Renovação', icon: 'contract_edit' },
    { id: AppView.FINANCE, label: 'Financeiro', icon: 'account_balance_wallet' },
    { id: AppView.STOCK, label: 'Gestão de Depósito', icon: 'warehouse' },
    { id: AppView.SETTINGS, label: 'Configurações', icon: 'settings' },
  ];

  // Dynamic Permissions Filtering logic
  const navItems = allNavItems.filter(item => {
    const email = user?.email;

    // Check dynamic tab visibility
    return canViewTab(item.id, email, profile);
  });

  const isEngActive = currentView.startsWith('ENG_');

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 flex flex-col border-r border-white/10 bg-background-dark shrink-0 transition-transform duration-300 ease-in-out
        lg:static lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex h-20 items-center gap-3 px-8 border-b border-white/5 relative">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-dark border border-white/10 shadow-lg overflow-hidden">
            <img src="/logo.png" alt="Incêndio Brasília Logo" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-bold leading-none tracking-tight text-white">Incêndio Brasília</h1>
            <span className="text-xs font-medium text-white/50 mt-1 uppercase tracking-wider">Projetos</span>
          </div>
          {isOpen && (
            <button onClick={onClose} className="absolute right-4 lg:hidden text-slate-400 hover:text-white">
              <span className="material-symbols-outlined">close</span>
            </button>
          )}
        </div>

      <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
        {navItems.map((item) => {
          const isActive = item.id === currentView || (item.id === AppView.ENGINEERING_PHASE_A && isEngActive);
          return (
            <button
              key={item.id}
              onClick={() => {
                onViewChange(item.id);
                if (onClose) onClose();
              }}
              className={`w-full group flex items-center gap-3 rounded-lg px-4 py-3 transition-all ${isActive
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
            >
              <span className={`material-symbols-outlined ${isActive ? 'fill-1' : ''}`}>{item.icon}</span>
              <span className="font-bold tracking-tight text-xs uppercase">{item.label}</span>
            </button>
          );
        })}

      </nav>

      <div className="p-4 border-t border-white/5">
        <div className="mb-4">
          <button
            onClick={() => signOut()}
            className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-red-400 hover:bg-white/5 hover:text-red-300 transition-all"
          >
            <span className="material-symbols-outlined">logout</span>
            <span className="font-medium">Sair</span>
          </button>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <div
            className="h-10 w-10 rounded-full bg-cover bg-center border border-white/10"
            style={{ backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuAt0IGx7V5VEDVjpIU9wrDSByDddbsXgH63NvwBqwzzYnD_G17SoRgTdbSok1WDep8TPuFWfO3A9oZFc2mb-tbSt4qyRLNZKlwOXT1F_DPvoybBhXRGBJY9XGP458Nexq95gd3m_S9hug5_dmiV8_GTDmtkLYVJsobLVRNt47AYMJv7SWurPxWlRvz-QVyWpjXgDyVcE1KRkQn1u8dgNsn348nQFlF4eV1D2VeEHgIvp7sTR_NzHeVlDvQTnKHzSdXxp2i-EoqbwPRS')` }}
          />
          <div className="flex flex-col overflow-hidden">
            <p className="truncate text-sm font-medium text-white">{user?.email || 'Usuário'}</p>
            <p className="truncate text-xs text-white/50">{user?.id.slice(0, 8)}...</p>
          </div>
        </div>
      </div>
    </aside>
    </>
  );
};

export default Sidebar;
