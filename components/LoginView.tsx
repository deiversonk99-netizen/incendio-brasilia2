import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type AuthMode = 'LOGIN' | 'SIGNUP' | 'FORGOT_PASSWORD' | 'UPDATE_PASSWORD';

const LoginView: React.FC = () => {
    const [mode, setMode] = useState<AuthMode>('LOGIN');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const { isRecoveryMode, setIsRecoveryMode } = useAuth();

    useEffect(() => {
        if (isRecoveryMode) {
            setMode('UPDATE_PASSWORD');
        }
    }, [isRecoveryMode]);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        try {
            if (mode === 'SIGNUP') {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                });
                if (error) throw error;
                setMessage('Verifique seu email para confirmar o cadastro!');
            } else if (mode === 'LOGIN') {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
            } else if (mode === 'FORGOT_PASSWORD') {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin,
                });
                if (error) throw error;
                setMessage('Link de recuperação enviado para seu email!');
            } else if (mode === 'UPDATE_PASSWORD') {
                const { error } = await supabase.auth.updateUser({
                    password: newPassword,
                });
                if (error) throw error;
                setIsRecoveryMode(false);
                setMessage('Senha atualizada com sucesso! Você já pode entrar.');
                setMode('LOGIN');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const getTitle = () => {
        switch (mode) {
            case 'SIGNUP': return 'Crie sua conta tecnológica';
            case 'FORGOT_PASSWORD': return 'Recuperar Senha';
            case 'UPDATE_PASSWORD': return 'Definir Nova Senha';
            default: return 'Entre para gerenciar seus projetos';
        }
    };

    const getButtonLabel = () => {
        if (loading) return 'Processando...';
        switch (mode) {
            case 'SIGNUP': return 'Criar Conta';
            case 'FORGOT_PASSWORD': return 'Enviar Link';
            case 'UPDATE_PASSWORD': return 'Atualizar Senha';
            default: return 'Entrar';
        }
    };

    return (
        <div className="flex h-screen w-full items-center justify-center bg-background-dark p-4">
            <div className="w-full max-w-md overflow-hidden rounded-2xl bg-surface-dark border border-white/10 shadow-2xl">
                <div className="p-8">
                    <div className="mb-8 flex flex-col items-center text-center">
                        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-surface-dark border border-white/10 shadow-xl overflow-hidden">
                            <img src="/logo.png" alt="Incêndio Brasília Logo" className="w-full h-full object-contain" />
                        </div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">Incêndio Brasília</h1>
                        <p className="mt-2 text-sm text-slate-400">
                            {getTitle()}
                        </p>
                    </div>

                    <form onSubmit={handleAuth} className="space-y-4">
                        {mode !== 'UPDATE_PASSWORD' && (
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Email</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white placeholder-slate-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                                    placeholder="seu@email.com"
                                    required
                                />
                            </div>
                        )}

                        {mode !== 'FORGOT_PASSWORD' && mode !== 'UPDATE_PASSWORD' && (
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Senha</label>
                                    {mode === 'LOGIN' && (
                                        <button
                                            type="button"
                                            onClick={() => setMode('FORGOT_PASSWORD')}
                                            className="text-[10px] font-bold uppercase tracking-wider text-primary hover:text-rose-400 transition-colors"
                                        >
                                            Esqueceu a senha?
                                        </button>
                                    )}
                                </div>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white placeholder-slate-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                        )}

                        {mode === 'UPDATE_PASSWORD' && (
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Nova Senha</label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white placeholder-slate-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                                    placeholder="••••••••"
                                    required
                                    minLength={6}
                                />
                            </div>
                        )}

                        {error && (
                            <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400 border border-red-500/20">
                                {error}
                            </div>
                        )}

                        {message && (
                            <div className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-400 border border-emerald-500/20">
                                {message}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-6 w-full rounded-lg bg-gradient-to-r from-primary to-rose-600 py-3 font-semibold text-white shadow-lg shadow-primary/25 hover:from-primary-dark hover:to-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {buttonLabel()}
                        </button>
                    </form>

                    <div className="mt-6 text-center space-y-2">
                        {mode === 'LOGIN' ? (
                            <button
                                onClick={() => setMode('SIGNUP')}
                                className="text-sm text-slate-400 hover:text-white transition-colors"
                            >
                                Não tem conta? Crie uma agora
                            </button>
                        ) : (
                            <button
                                onClick={() => setMode('LOGIN')}
                                className="text-sm text-slate-400 hover:text-white transition-colors block w-full"
                            >
                                Voltar para o Login
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    function buttonLabel() {
        if (loading) {
            return (
                <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></span>
                    Processando...
                </span>
            );
        }
        return getButtonLabel();
    }
};

export default LoginView;
