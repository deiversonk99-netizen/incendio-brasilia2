import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface UserProfile {
    id: string | null;
    email: string;
    role: 'SUPERADMIN' | 'ADMIN' | 'MANAGER' | 'USER' | 'FUNCIONARIO';
    permissions: any;
    status?: 'INVITED' | 'ACTIVE' | 'BLOCKED';
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

    const fetchProfile = async (email: string, userId: string): Promise<UserProfile | null> => {
        let { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('email', email.toLowerCase())
            .limit(1)
            .maybeSingle();

        // Perfis pré-cadastrados são vinculados ao auth.uid somente depois
        // que o e-mail foi autenticado. A função no banco nunca reativa BLOCKED.
        if (data && data.status !== 'BLOCKED' && (data.status === 'INVITED' || data.id !== userId)) {
            const { data: claimedProfile, error: claimError } = await supabase.rpc('activate_current_user_profile');
            if (!claimError && claimedProfile) {
                data = claimedProfile as UserProfile;
                error = null;
            } else if (claimError) {
                console.error('Unable to activate/link current profile:', claimError.message);
            }
        }
            
        // Se o perfil existe, verificamos se o status é válido. 
        // Se não tiver a coluna status (ainda não migrado), assume ACTIVE.
        const isActive = data && (data.status === 'ACTIVE' || !data.status);
        
        if (data && isActive) {
            return data as UserProfile;
        }
        console.error('fetchProfile failed or user not ACTIVE:', error || data?.status);
        return null;
    };

    useEffect(() => {
        let isMounted = true;
        let profileSubscription: any = null;
        let subscribedUserId: string | null = null;
        let authRequestId = 0;

        const setupProfileListener = (userId: string) => {
            if (profileSubscription && subscribedUserId === userId) return;
            if (profileSubscription) supabase.removeChannel(profileSubscription);
            subscribedUserId = userId;
            profileSubscription = supabase
                .channel('custom-user-profile')
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'user_profiles', filter: `id=eq.${userId}` },
                    (payload) => {
                        if (!isMounted) return;
                        if (payload.eventType === 'DELETE') {
                            setProfile(null);
                            return;
                        }
                        const nextProfile = payload.new as UserProfile;
                        const isActive = nextProfile.status === 'ACTIVE' || !nextProfile.status;
                        setProfile(isActive ? nextProfile : null);
                    }
                )
                .subscribe();
        };

        const resolveSession = async (nextSession: Session | null) => {
            const requestId = ++authRequestId;
            if (!isMounted) return;

            setLoading(true);
            setSession(nextSession);
            setUser(nextSession?.user ?? null);

            if (!nextSession?.user?.email) {
                setProfile(null);
                if (profileSubscription) {
                    supabase.removeChannel(profileSubscription);
                    profileSubscription = null;
                    subscribedUserId = null;
                }
                if (isMounted && requestId === authRequestId) setLoading(false);
                return;
            }

            const resolvedProfile = await fetchProfile(nextSession.user.email, nextSession.user.id).catch(e => {
                console.error('fetchProfile err', e);
                return null;
            });

            if (!isMounted || requestId !== authRequestId) return;
            setProfile(resolvedProfile);
            setupProfileListener(nextSession.user.id);
            setLoading(false);
        };

        const initAuth = async () => {
            try {
                // Try to get session — Supabase reads from localStorage, usually instant
                const { data: { session } } = await supabase.auth.getSession();

                await resolveSession(session);
            } catch (err) {
                console.error('Auth init error:', err);
                if (isMounted) setLoading(false);
            }
        };

        initAuth();

        // Listen for auth state changes (login, logout, token refresh, etc.)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
            if (!isMounted) return;

            if (event === 'PASSWORD_RECOVERY') {
                setIsRecoveryMode(true);
            }

            // Avoid issuing another Supabase request from inside the auth callback.
            // Scheduling it also prevents auth-lock deadlocks on INITIAL_SESSION/SIGNED_IN.
            setTimeout(() => {
                if (isMounted) void resolveSession(nextSession);
            }, 0);
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
