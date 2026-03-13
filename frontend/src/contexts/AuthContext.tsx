import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { AppUser } from '@/types/database';
import type { Session } from '@supabase/supabase-js';

interface AuthContextType {
  session: Session | null;
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  hasRole: (...roles: AppUser['role'][]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = async (userId: string) => {
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 5000);
    });

    const profilePromise = supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          if (error.message === 'Failed to fetch' || error.message.includes('network')) {
            console.warn('Network error fetching user profile - possibly offline');
          } else {
            console.error('Error fetching user profile:', error.message, error.details, error.hint);
          }
          return null;
        }
        if (!data) {
          console.warn('No profile data found for user:', userId);
          return null;
        }
        return data as AppUser;
      });

    return Promise.race([profilePromise, timeoutPromise]);
  };

  useEffect(() => {
    const hardTimeout = setTimeout(() => {
      if (loading) {
        setLoading(false);
      }
    }, 2000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        try {
          setSession(session);
          if (session?.user) {
            const profile = await fetchUserProfile(session.user.id);
            if (profile && !profile.is_active) {
              await supabase.auth.signOut();
              setUser(null);
              setSession(null);
            } else {
              setUser(profile);
            }
          } else {
            setUser(null);
          }
        } catch (error) {
          console.error('Error in auth state change:', error);
        } finally {
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      try {
        setSession(session);
        if (session?.user) {
          const profile = await fetchUserProfile(session.user.id);
          if (profile && !profile.is_active) {
            await supabase.auth.signOut();
            setUser(null);
            setSession(null);
          } else {
            setUser(profile);
          }
        }
      } catch (error) {
        console.error('Error in getSession:', error);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(hardTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    // 1. Create auth user in Supabase
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) return { error: authError.message };
    if (!authData.user) return { error: 'Signup failed — no user returned' };

    // 2. Insert into public.users with role = 'patient'
    const { error: profileError } = await supabase.from('users').insert({
      id: authData.user.id,
      name: fullName,
      full_name: fullName,
      email: email,
      role: 'patient',
      department: 'Patient',
      specialization: null,
      is_active: true,
    });
    if (profileError) {
      console.error('Error creating patient profile:', profileError);
      return { error: profileError.message };
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  const hasRole = (...roles: AppUser['role'][]) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signIn, signUp, signOut, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
