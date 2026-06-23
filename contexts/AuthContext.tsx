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
        // Check active sessions and sets the user
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user?.email) await fetchProfile(session.user.email);
            setLoading(false);
        });

        // Listen for changes on auth state (logged in, signed out, etc.)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                setIsRecoveryMode(true);
            }

            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user?.email) await fetchProfile(session.user.email);
            else setProfile(null);
            setLoading(false);
        });

        // Real-time listener for profile updates
        let profileSubscription: any = null;
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user?.id) {
                profileSubscription = supabase
                    .channel('custom-user-profile')
                    .on(
                        'postgres_changes',
                        { event: 'UPDATE', schema: 'public', table: 'user_profiles', filter: `id=eq.${session.user.id}` },
                        (payload) => {
                            setProfile(payload.new as UserProfile);
                        }
                    )
                    .subscribe();
            }
        });

        return () => {
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
