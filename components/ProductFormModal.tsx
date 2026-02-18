import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Product } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface ProductFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    productToEdit?: Product | null;
}

const ProductFormModal: React.FC<ProductFormModalProps> = ({ isOpen, onClose, onSuccess, productToEdit }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [suppliers, setSuppliers] = useState<{ id: string, name: string }[]>([]);

    const [formData, setFormData] = useState<Partial<Product>>({
        name: '',
        category: 'Material',
        unit: 'un',
        price: 0,
        supplier_id: '',
        is_signage: false,
        cost_price: 0,
        observation: '',
        registration_date: new Date().toISOString().split('T')[0],
        image: '',
        storage_location: ''
    });

    useEffect(() => {
        if (isOpen) {
            fetchSuppliers();
            if (productToEdit) {
                setFormData({
                    name: productToEdit.name,
                    category: productToEdit.category,
                    unit: productToEdit.unit,
                    price: productToEdit.price,
                    supplier_id: productToEdit.supplier_id || '',
                    is_signage: !!productToEdit.is_signage,
                    cost_price: productToEdit.cost_price || 0,
                    observation: productToEdit.observation || '',
                    registration_date: productToEdit.registration_date || new Date().toISOString().split('T')[0],
                    image: productToEdit.image || '',
                    storage_location: productToEdit.storage_location || ''
                });
            } else {
                // Reset form
                setFormData({
                    name: '',
                    category: 'Material',
                    unit: 'un',
                    price: 0,
                    supplier_id: '',
                    is_signage: false,
                    cost_price: 0,
                    observation: '',
                    registration_date: new Date().toISOString().split('T')[0],
                    image: '',
                    storage_location: ''
                });
            }
        }
    }, [isOpen, productToEdit]);

    const fetchSuppliers = async () => {
        const { data } = await supabase.from('suppliers').select('id, name').order('name');
        if (data) setSuppliers(data);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setFormData({ ...formData, image: reader.result as string });
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const cleanedData = { ...formData };
            if (!cleanedData.supplier_id) delete cleanedData.supplier_id;
            if (!cleanedData.image) delete cleanedData.image; // Do not send empty string if no image
            if (!cleanedData.observation) delete cleanedData.observation;
            if (!cleanedData.storage_location) delete cleanedData.storage_location;

            if (productToEdit) {
                const { error } = await supabase
                    .from('product_catalog')
                    .update(cleanedData)
                    .eq('id', productToEdit.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('product_catalog')
                    .insert([{ ...cleanedData, user_id: user?.id }]);
                if (error) throw error;
            }

            onSuccess();
            onClose();
        } catch (error: any) {
            alert('Erro ao salvar produto: ' + (error.message || 'Erro desconhecido'));
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4 overflow-y-auto">
            <div className="bg-surface-dark border border-white/10 rounded-2xl p-8 w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 my-auto max-h-[95vh] overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-white uppercase tracking-wider">
                        {productToEdit ? 'Editar Produto' : 'Novo Produto'}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Image Upload */}
                        <div className="md:col-span-2 flex justify-center">
                            <div className="relative group cursor-pointer w-32 h-32 rounded-xl border-2 border-dashed border-white/20 hover:border-primary flex items-center justify-center overflow-hidden transition-all bg-white/5">
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                />
                                {formData.image ? (
                                    <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="flex flex-col items-center text-slate-500 group-hover:text-primary">
                                        <span className="material-symbols-outlined text-[32px]">add_a_photo</span>
                                        <span className="text-[10px] uppercase font-bold mt-1">Foto</span>
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                    <span className="text-white text-xs font-bold uppercase">Alterar</span>
                                </div>
                            </div>
                        </div>

                        {/* Basic Info */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nome do Produto</label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="bg-background-dark border border-white/10 rounded-lg p-3 text-white focus:border-primary outline-none transition-colors"
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Categoria</label>
                            <select
                                value={formData.category}
                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                                className="bg-background-dark border border-white/10 rounded-lg p-3 text-white focus:border-primary outline-none transition-colors appearance-none"
                            >
                                <option value="Material">Material</option>
                                <option value="Equipamento">Equipamento</option>
                                <option value="Ferramenta">Ferramenta</option>
                                <option value="EPI">EPI</option>
                                <option value="Uniforme">Uniforme</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Localização (Estoque)</label>
                            <input
                                type="text"
                                value={formData.storage_location}
                                onChange={e => setFormData({ ...formData, storage_location: e.target.value })}
                                placeholder="Ex: Pratilheira A, Gaveta 2"
                                className="bg-background-dark border border-white/10 rounded-lg p-3 text-white focus:border-primary outline-none transition-colors"
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Fornecedor</label>
                            <select
                                value={formData.supplier_id}
                                onChange={e => setFormData({ ...formData, supplier_id: e.target.value })}
                                className="bg-background-dark border border-white/10 rounded-lg p-3 text-white focus:border-primary outline-none transition-colors appearance-none"
                            >
                                <option value="">Selecione...</option>
                                {suppliers.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Preço de Venda (R$)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={formData.price}
                                onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                                className="bg-background-dark border border-white/10 rounded-lg p-3 text-white focus:border-primary outline-none transition-colors"
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Preço de Custo (R$)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={formData.cost_price}
                                onChange={e => setFormData({ ...formData, cost_price: parseFloat(e.target.value) })}
                                className="bg-background-dark border border-white/10 rounded-lg p-3 text-white focus:border-primary outline-none transition-colors"
                            />
                        </div>

                        <div className="md:col-span-2 flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Observações</label>
                            <textarea
                                value={formData.observation}
                                onChange={e => setFormData({ ...formData, observation: e.target.value })}
                                className="bg-background-dark border border-white/10 rounded-lg p-3 text-white focus:border-primary outline-none transition-colors resize-none h-24"
                            />
                        </div>
                    </div>

                    <div className="flex gap-4 pt-4 border-t border-white/10">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 border border-white/10 rounded-xl text-slate-300 font-bold hover:bg-white/5 transition-all uppercase tracking-widest text-sm"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 py-3 bg-primary hover:bg-primary-dark rounded-xl text-white font-bold shadow-lg shadow-primary/20 transition-all uppercase tracking-widest text-sm disabled:opacity-50"
                        >
                            {loading ? 'Salvando...' : 'Salvar Produto'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ProductFormModal;
