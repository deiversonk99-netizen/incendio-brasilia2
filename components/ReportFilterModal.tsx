import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Modal, Button, Input } from './ui';

interface ReportFilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (filters: ReportFilters) => void;
    isLoading?: boolean;
}

export interface ReportFilters {
    startDate: string;
    endDate: string;
    category: string;
    status: 'ALL' | 'PAID' | 'PENDING';
    search: string;
}

const ReportFilterModal: React.FC<ReportFilterModalProps> = ({
    isOpen,
    onClose,
    onGenerate,
    isLoading = false
}) => {
    const [filters, setFilters] = useState<ReportFilters>({
        startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        endDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0],
        category: 'ALL',
        status: 'ALL',
        search: ''
    });

    const [categories, setCategories] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchCategories();
        }
    }, [isOpen]);

    const fetchCategories = async () => {
        const { data } = await supabase.from('financial_transactions').select('category');
        if (data) {
            const uniqueCats = Array.from(new Set(data.map((item: { category: string }) => item.category).filter(Boolean)));
            setCategories(uniqueCats as string[]);
        }
    };

    const handlePreset = (type: 'thisMonth' | 'lastMonth' | 'last90') => {
        const now = new Date();
        let start = new Date();
        let end = new Date();

        if (type === 'thisMonth') {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        } else if (type === 'lastMonth') {
            start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            end = new Date(now.getFullYear(), now.getMonth(), 0);
        } else if (type === 'last90') {
            start = new Date();
            start.setDate(now.getDate() - 90);
            end = now;
        }

        setFilters((prev: ReportFilters) => ({
            ...prev,
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0]
        }));
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (filters.endDate < filters.startDate) {
            setError('A data final não pode ser anterior à data inicial.');
            return;
        }
        setError(null);
        onGenerate(filters);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Configurar Relatório"
            description="Defina os parâmetros para geração completa do PDF"
            footer={
                <div className="flex gap-4">
                    <Button variant="secondary" onClick={onClose} className="flex-1">
                        Cancelar
                    </Button>
                    <Button
                        variant="primary"
                        onClick={() => {
                            const form = document.getElementById('report-filter-form') as HTMLFormElement;
                            if (form.checkValidity()) {
                                handleSubmit({ preventDefault: () => { } } as any);
                            } else {
                                form.reportValidity();
                            }
                        }}
                        isLoading={isLoading}
                        className="flex-1"
                    >
                        <span className="material-symbols-outlined mr-2">picture_as_pdf</span>
                        Gerar PDF
                    </Button>
                </div>
            }
        >
            <form id="report-filter-form" onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                    <label className="ds-label">Período de Referência</label>
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="De:"
                            type="date"
                            required
                            value={filters.startDate}
                            onChange={e => setFilters({ ...filters, startDate: e.target.value })}
                        />
                        <Input
                            label="Até:"
                            type="date"
                            required
                            value={filters.endDate}
                            onChange={e => setFilters({ ...filters, endDate: e.target.value })}
                        />
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                        {['thisMonth', 'lastMonth', 'last90'].map((type) => (
                            <Button
                                key={type}
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => handlePreset(type as any)}
                            >
                                {type === 'thisMonth' ? 'Este Mês' : type === 'lastMonth' ? 'Mês Passado' : 'Últimos 90 dias'}
                            </Button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="ds-label">Categoria</label>
                        <select
                            value={filters.category}
                            onChange={e => setFilters({ ...filters, category: e.target.value })}
                            className="ds-input cursor-pointer"
                        >
                            <option value="ALL">Todas as Categorias</option>
                            {categories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="ds-label">Status</label>
                        <select
                            value={filters.status}
                            onChange={e => setFilters({ ...filters, status: e.target.value as any })}
                            className="ds-input cursor-pointer"
                        >
                            <option value="ALL">Todos os Status</option>
                            <option value="PAID">Pago / Recebido</option>
                            <option value="PENDING">Pendente</option>
                        </select>
                    </div>
                </div>

                <Input
                    label="Projeto / Cliente"
                    placeholder="Buscar por nome ou projeto..."
                    value={filters.search}
                    onChange={e => setFilters({ ...filters, search: e.target.value })}
                />

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-center gap-3">
                        <span className="material-symbols-outlined text-red-500">warning</span>
                        <p className="text-[10px] text-red-400 font-bold uppercase">{error}</p>
                    </div>
                )}
            </form>
        </Modal>
    );
};

export default ReportFilterModal;
