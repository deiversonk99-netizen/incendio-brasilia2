
import React from 'react';
import { MOCK_PROJECTS } from '../constants';
import PageHeader from './PageHeader';
import NewProjectModal from './NewProjectModal';
import { supabase } from '../lib/supabase';

const ProjectsView: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [projects, setProjects] = React.useState<any[]>([]); // Initialize empty, fetch real data
  const [loading, setLoading] = React.useState(true);

  const fetchProjects = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (data) {
      setProjects(data);
    }
    setLoading(false);
  };

  React.useEffect(() => {
    fetchProjects();
  }, []);

  const columns = [
    { id: 'ANALYSIS', label: 'Em Análise', color: 'bg-blue-400', shadow: 'shadow-[0_0_8px_rgba(96,165,250,0.6)]' },
    { id: 'APPROVED', label: 'Aprovado', color: 'bg-yellow-400', shadow: 'shadow-[0_0_8px_rgba(250,204,21,0.6)]' },
    { id: 'EXECUTION', label: 'Execução', color: 'bg-primary', shadow: 'shadow-[0_0_8px_rgba(226,29,72,0.6)]' },
    { id: 'DONE', label: 'Concluído', color: 'bg-emerald-400', shadow: 'shadow-[0_0_8px_rgba(52,211,153,0.6)]' },
  ];

  return (
    <>
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="flex-none bg-background-dark border-b border-[#46252c] p-6 pb-4">
          <div className="max-w-[1600px] mx-auto w-full">
            <PageHeader
              title="Pipeline de Projetos"
              subtitle="Gerencie o status e o andamento de todos os projetos ativos."
              actions={
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 h-10 text-white font-bold shadow-lg shadow-red-900/20 transition-all hover:bg-primary-dark"
                >
                  <span className="material-symbols-outlined">add</span>
                  <span>Novo Projeto</span>
                </button>
              }
            />

            <div className="flex gap-2 overflow-x-auto pb-4 mt-6">
              <button className="flex h-9 shrink-0 items-center gap-2 rounded-full bg-primary/20 border border-primary/30 px-4 text-white text-sm font-medium">
                <span className="material-symbols-outlined text-[18px]">groups</span>
                Todos os Clientes
              </button>
              {['Construtora X', 'Shopping Norte', 'Edifício Horizon'].map(chip => (
                <button key={chip} className="flex h-9 shrink-0 items-center gap-2 rounded-full bg-[#46252c] border border-[#64353f] px-4 text-text-muted text-sm font-medium hover:bg-[#5a3039]">
                  {chip}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 bg-surface-dark">
          <div className="flex h-full gap-6 min-w-[1200px]">
            {columns.map(col => (
              <div key={col.id} className="flex-1 flex flex-col min-w-[300px] h-full">
                <div className="flex items-center justify-between mb-4 px-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${col.color} ${col.shadow}`}></span>
                    <h3 className="text-white font-bold text-sm uppercase tracking-wider">{col.label}</h3>
                    <span className="bg-[#46252c] text-text-muted text-xs font-bold px-2 py-0.5 rounded-full">
                      {projects.filter(p => p.status === col.id).length}
                    </span>
                  </div>
                  <button className="text-text-muted hover:text-white"><span className="material-symbols-outlined text-[20px]">add</span></button>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-3 pb-4">
                  {loading ? (
                    <div className="text-center text-slate-500 text-sm py-4">Carregando...</div>
                  ) : (
                    projects.filter(p => p.status === col.id).map(proj => (
                      <div key={proj.id} className="bg-card-dark rounded-xl p-4 border border-[#64353f] hover:border-primary/50 cursor-pointer group shadow-sm transition-all hover:translate-y-[-2px]">
                        <div className="flex justify-between items-start mb-2">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wide border ${proj.status === 'ANALYSIS' ? 'bg-blue-900/40 text-blue-300 border-blue-900/50' :
                            'bg-orange-900/40 text-orange-300 border-orange-900/50'
                            }`}>
                            {proj.status === 'ANALYSIS' ? 'Novo' : 'Prioridade'}
                          </span>
                        </div>
                        <h4 className="text-white font-bold text-base mb-1">{proj.name}</h4>
                        <div className="flex items-center gap-1.5 mb-3">
                          <span className="material-symbols-outlined text-text-muted text-[14px]">apartment</span>
                          <p className="text-text-muted text-xs font-medium">{proj.client}</p>
                        </div>
                        <div className="h-px bg-[#64353f]/50 w-full mb-3"></div>
                        <div className="flex justify-between items-center">
                          <div className="flex -space-x-2">
                            {/* Placeholder avatars for now since DB doesn't have team yet */}
                            {[1, 2].map((_, i) => (
                              <div key={i} className="w-7 h-7 rounded-full border-2 border-card-dark bg-slate-700 flex items-center justify-center text-[10px] text-white font-bold">
                                {String.fromCharCode(65 + i)}
                              </div>
                            ))}
                          </div>
                          <div className="text-right">
                            <p className="text-white text-sm font-bold">R$ {Number(proj.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            <p className="text-text-muted text-[10px]">Vence em {proj.deadline}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <NewProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => fetchProjects()}
      />
    </>
  );
};

export default ProjectsView;
