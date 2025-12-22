import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

const LoginView: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        try {
            if (isSignUp) {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                });
                if (error) throw error;
                setMessage('Verifique seu email para confirmar o cadastro!');
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
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
                            {isSignUp ? 'Crie sua conta tecnológica' : 'Entre para gerenciar seus projetos'}
                        </p>
                    </div>

                    <form onSubmit={handleAuth} className="space-y-4">
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
                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Senha</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full rounded-lg bg-background-dark border border-white/10 px-4 py-3 text-white placeholder-slate-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                                placeholder="••••••••"
                                required
                            />
                        </div>

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
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></span>
                                    Processando...
                                </span>
                            ) : (
                                isSignUp ? 'Criar Conta' : 'Entrar'
                            )}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <button
                            onClick={() => setIsSignUp(!isSignUp)}
                            className="text-sm text-slate-400 hover:text-white transition-colors"
                        >
                            {isSignUp ? 'Já tem uma conta? Entre aqui' : 'Não tem conta? Crie uma agora'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginView;
