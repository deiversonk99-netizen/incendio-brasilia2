
import React, { useState, useCallback } from 'react';
import { AppView } from './types';
import Sidebar from './components/Sidebar';
import DashboardView from './components/DashboardView';
import ProjectsView from './components/ProjectsView';
import FinanceView from './components/FinanceView';
import TasksView from './components/TasksView';
import EngineeringSurvey from './components/EngineeringSurvey';
import EngineeringComposition from './components/EngineeringComposition';
import EngineeringProposal from './components/EngineeringProposal';
import KitsConfigurationView from './components/KitsConfigurationView';
import LoginView from './components/LoginView';
import ProductsView from './components/ProductsView';
import ClientsView from './components/ClientsView';
import SuppliersView from './components/SuppliersView';
import ServicesView from './components/ServicesView';
import ServiceModelsView from './components/ServiceModelsView';
import InventoryView from './components/InventoryView';
import StockView from './components/StockView';
import RenewalControlView from './components/RenewalControlView';
import SettingsView from './components/SettingsView';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { isSuperAdmin, isStockAdmin, isFinanceAdmin, isProposalAdmin, canViewTab } from './lib/permissions';

import AdminBoardsView from './components/AdminBoardsView';

const AppContent: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [engineeringProjectId, setEngineeringProjectId] = useState<string>('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { session, user, profile, loading, isRecoveryMode } = useAuth();
  const [safetyLoading, setSafetyLoading] = React.useState(true);

  // Safety net: never show the spinner for more than 3 seconds
  React.useEffect(() => {
    const timer = setTimeout(() => setSafetyLoading(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  const isLoading = loading && safetyLoading;


  const renderContent = useCallback(() => {
    const userRoleCheck = (view: AppView) => {
      return canViewTab(view, user?.email || undefined, profile);
    };

    if (!userRoleCheck(currentView)) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-background-dark text-white p-8">
          <span className="material-symbols-outlined text-red-500 text-6xl mb-4">lock</span>
          <h2 className="text-2xl font-bold mb-2">Acesso Negado</h2>
          <p className="text-slate-400 text-center max-w-md mb-6">
            Você não possui permissão para acessar este módulo. Caso ache que isso seja um erro, entre em contato com o administrador.
          </p>
          <button
            onClick={() => setCurrentView(profile?.role === 'FUNCIONARIO' ? AppView.PLACAS : AppView.DASHBOARD)}
            className="px-6 py-2 bg-primary hover:bg-primary-dark rounded-lg font-bold transition-all"
          >
            Voltar para Início
          </button>
        </div>
      );
    }

    switch (currentView) {
      case AppView.DASHBOARD:
        return <DashboardView
          onViewChange={(view) => setCurrentView(view)}
          onSelectProject={(id) => setEngineeringProjectId(id)}
        />;
      case AppView.PROJECTS:
        return <ProjectsView />;
      case AppView.FINANCE:
        return <FinanceView />;
      case AppView.TASKS:
        return <TasksView viewMode="minhas_tarefas" />;
      case AppView.TEAM_TASKS:
        return <TasksView viewMode="monitoramento" />;
      case AppView.ADMIN_BOARDS:
        return <AdminBoardsView />;
      case AppView.CLIENTS:
        return <ClientsView />;
      case AppView.ENGINEERING_PHASE_A:
        return <EngineeringSurvey
          onNext={() => setCurrentView(AppView.ENGINEERING_PHASE_B)}
          selectedProjectId={engineeringProjectId}
          onSelectProject={setEngineeringProjectId}
        />;
      case AppView.ENGINEERING_PHASE_B:
        return <EngineeringComposition
          onNext={() => setCurrentView(AppView.ENGINEERING_PHASE_C)}
          selectedProjectId={engineeringProjectId}
          onSelectProject={setEngineeringProjectId}
        />;
      case AppView.ENGINEERING_PHASE_C:
        return <EngineeringProposal
          selectedProjectId={engineeringProjectId}
          onSelectProject={setEngineeringProjectId}
        />;
      case AppView.KITS:
        return <KitsConfigurationView />;
      case AppView.CATALOG:
        return <ProductsView />;
      case AppView.SUPPLIERS:
        return <SuppliersView />;
      case AppView.SERVICES:
        return <ServicesView />;
      case AppView.SERVICE_MODELS:
        return <ServiceModelsView />;
      case AppView.PLACAS:
        return <InventoryView />;
      case AppView.STOCK:
        return <StockView />;
      case AppView.RENEWALS:
        return <RenewalControlView />;
      case AppView.SETTINGS:
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  }, [currentView, engineeringProjectId, user, profile]);

  // Initial Redirection
  React.useEffect(() => {
    if (session && currentView === AppView.DASHBOARD) {
      if (profile?.role === 'FUNCIONARIO') {
        setCurrentView(AppView.PLACAS);
      } else if (profile && !canViewTab(AppView.DASHBOARD, user?.email, profile)) {
        // Find the first tab they have access to
        const allNavItems = [
          AppView.CLIENTS, AppView.TASKS, AppView.KITS, AppView.CATALOG,
          AppView.SUPPLIERS, AppView.PLACAS, AppView.SERVICES, AppView.SERVICE_MODELS,
          AppView.ENGINEERING_PHASE_A, AppView.ENGINEERING_PHASE_B, AppView.ENGINEERING_PHASE_C,
          AppView.RENEWALS, AppView.FINANCE, AppView.STOCK, AppView.SETTINGS, AppView.TEAM_TASKS, AppView.ADMIN_BOARDS
        ];
        for (const view of allNavItems) {
          if (canViewTab(view, user?.email, profile)) {
            setCurrentView(view);
            break;
          }
        }
      }
    }
  }, [session, profile, currentView, user?.email]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background-dark">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!session || isRecoveryMode) {
    return <LoginView />;
  }

  if (session && !profile && !isLoading) {
    return (
        <div className="flex flex-col items-center justify-center h-screen bg-background-dark text-white p-8">
          <span className="material-symbols-outlined text-red-500 text-6xl mb-4">block</span>
          <h2 className="text-2xl font-bold mb-2">Acesso não autorizado</h2>
          <p className="text-slate-400 text-center max-w-md mb-6">
            Sua conta não possui um perfil ativo ou foi bloqueada.
          </p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="px-6 py-2 bg-primary hover:bg-primary-dark rounded-lg font-bold transition-all"
          >
            Sair
          </button>
        </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar
        currentView={currentView}
        onViewChange={(view) => { setCurrentView(view); setIsMobileMenuOpen(false); }}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background-light dark:bg-background-dark relative">
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-4 bg-surface-dark border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-surface-dark border border-white/10 overflow-hidden flex items-center justify-center">
              <img src="/logo.png" alt="Incêndio Brasília Logo" className="w-full h-full object-contain" />
            </div>
            <span className="font-bold text-white tracking-tight text-sm">Incêndio Brasília</span>
          </div>
          <button onClick={() => setIsMobileMenuOpen(true)} className="text-white p-1 hover:text-primary transition-colors">
            <span className="material-symbols-outlined">menu</span>
          </button>
        </div>
        {renderContent()}
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
