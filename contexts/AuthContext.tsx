import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface UserProfile {
    id: string | null;
    email: string;
    role: 'ADMIN' | 'MANAGER' | 'USER' | 'FUNCIONARIO';
    permissions: any;
}

interface AuthContextType {
    session: Session | null;
    user: User | null;
    profile: UserProfile | null;
    loading: boolean;
    isRecoveryMode: boolean;
    setIsRecoveryMode: (value: boolean) => void;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    profile: null,
    loading: true,
    isRecoveryMode: false,
    setIsRecoveryMode: () => { },
    signOut: async () => { },
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [isRecoveryMode, setIsRecoveryMode] = useState(false);

    const fetchProfile = async (email: string) => {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .ilike('email', email)
            .limit(1)
            .maybeSingle();
        if (data) setProfile(data);
        else console.error('fetchProfile failed:', error);
    };

    useEffect(() => {
        let isMounted = true;
        let profileSubscription: any = null;

        const setupProfileListener = (userId: string) => {
            if (profileSubscription) return;
            profileSubscription = supabase
                .channel('custom-user-profile')
                .on(
                    'postgres_changes',
                    { event: 'UPDATE', schema: 'public', table: 'user_profiles', filter: `id=eq.${userId}` },
                    (payload) => {
                        if (isMounted) setProfile(payload.new as UserProfile);
                    }
                )
                .subscribe();
        };

        const initAuth = async () => {
            try {
                // Try to get session — Supabase reads from localStorage, usually instant
                const { data: { session } } = await supabase.auth.getSession();

                if (isMounted) {
                    setSession(session);
                    setUser(session?.user ?? null);
                    if (session?.user?.email) {
                        await fetchProfile(session.user.email).catch(e => console.error('fetchProfile err', e));
                    }
                    if (session?.user?.id) {
                        setupProfileListener(session.user.id);
                    }
                }
            } catch (err) {
                console.error('Auth init error:', err);
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        initAuth();

        // Listen for auth state changes (login, logout, token refresh, etc.)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!isMounted) return;

            if (event === 'PASSWORD_RECOVERY') {
                setIsRecoveryMode(true);
            }

            setSession(session);
            setUser(session?.user ?? null);

            if (session?.user?.email) {
                await fetchProfile(session.user.email).catch(e => console.error('fetchProfile err', e));
            } else {
                setProfile(null);
            }

            if (session?.user?.id) {
                setupProfileListener(session.user.id);
            }

            // Always clear loading on any auth event
            if (isMounted) setLoading(false);
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
            if (profileSubscription) supabase.removeChannel(profileSubscription);
        };
    }, []);

    const signOut = async () => {
        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{ session, user, profile, loading, isRecoveryMode, setIsRecoveryMode, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
