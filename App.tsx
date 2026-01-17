
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
import SettingsView from './components/SettingsView';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { isSuperAdmin, isStockAdmin, isFinanceAdmin, isProposalAdmin } from './lib/permissions';

const AppContent: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [engineeringProjectId, setEngineeringProjectId] = useState<string>('');
  const { session, user, loading } = useAuth(); // Added user

  const renderContent = useCallback(() => {
    const userRoleCheck = (view: AppView) => {
      const email = user?.email;
      if (view === AppView.SETTINGS) {
        return isSuperAdmin(email);
      }
      if (view === AppView.FINANCE) {
        return isFinanceAdmin(email);
      }
      if (view === AppView.PLACAS || view === AppView.STOCK) {
        return isStockAdmin(email);
      }
      if (view === AppView.ENGINEERING_PHASE_A ||
        view === AppView.ENGINEERING_PHASE_B ||
        view === AppView.ENGINEERING_PHASE_C) {
        return isProposalAdmin(email);
      }
      return true;
    };

    if (!userRoleCheck(currentView)) {
      return <DashboardView />; // Redirect silent
    }

    switch (currentView) {
      case AppView.DASHBOARD:
        return <DashboardView />;
      case AppView.PROJECTS:
        return <ProjectsView />;
      case AppView.FINANCE:
        return <FinanceView />;
      case AppView.TASKS:
        return <TasksView />;
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
      case AppView.SETTINGS:
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  }, [currentView, engineeringProjectId, user]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background-dark">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!session) {
    return <LoginView />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar
        currentView={currentView}
        onViewChange={(view) => setCurrentView(view)}
      />
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background-light dark:bg-background-dark relative">
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
