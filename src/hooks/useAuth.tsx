import { useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const createOrganizationForNewUser = async (userId: string, email: string, fullName?: string) => {
    try {
      // Use the SECURITY DEFINER function to create org, membership, role and billing
      const { data, error } = await supabase.rpc('setup_new_user_organization', {
        _user_id: userId,
        _user_email: email,
        _full_name: fullName || null,
      });

      if (error) throw error;

      console.log('Organization created successfully:', data);
      return { error: null };
    } catch (error: any) {
      console.error('Error creating organization:', error);
      return { error };
    }
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) throw error;

      // Create organization for new user after signup
      if (data.user) {
        // Use setTimeout to defer to avoid auth deadlock
        setTimeout(async () => {
          await createOrganizationForNewUser(data.user!.id, email, fullName);
          
          // Notify admin about new signup
          try {
            await supabase.functions.invoke('notify-admin-signup', {
              body: {
                email,
                fullName: fullName || null,
                organizationName: fullName ? `${fullName}'s Agency` : null,
              },
            });
          } catch (notifyError) {
            console.error('Failed to send signup notification:', notifyError);
          }
        }, 0);
      }

      toast({
        title: "Inscription réussie",
        description: "Bienvenue ! Votre essai gratuit de 14 jours est activé.",
      });
      return { error: null };
    } catch (error: any) {
      toast({
        title: "Erreur d'inscription",
        description: error.message,
        variant: "destructive",
      });
      return { error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      toast({
        title: "Connexion réussie",
        description: "Bienvenue sur AVA Statistics",
      });
      return { error: null };
    } catch (error: any) {
      toast({
        title: "Erreur de connexion",
        description: error.message,
        variant: "destructive",
      });
      return { error };
    }
  };

  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });

      if (error) throw error;
      return { error: null };
    } catch (error: any) {
      toast({
        title: "Erreur de connexion Google",
        description: error.message,
        variant: "destructive",
      });
      return { error };
    }
  };

  const signInWithMicrosoft = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          redirectTo: `${window.location.origin}/`,
          scopes: 'email openid profile',
        },
      });

      if (error) throw error;
      return { error: null };
    } catch (error: any) {
      toast({
        title: "Erreur de connexion Microsoft",
        description: error.message,
        variant: "destructive",
      });
      return { error };
    }
  };

  const signInWithApple = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });

      if (error) throw error;
      return { error: null };
    } catch (error: any) {
      toast({
        title: "Erreur de connexion Apple",
        description: error.message,
        variant: "destructive",
      });
      return { error };
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?mode=reset`,
      });

      if (error) throw error;

      toast({
        title: "Email envoyé",
        description: "Vérifiez votre boîte mail pour réinitialiser votre mot de passe",
      });
      return { error: null };
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
      return { error };
    }
  };

  const updatePassword = async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast({
        title: "Mot de passe mis à jour",
        description: "Votre mot de passe a été changé avec succès",
      });
      return { error: null };
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
      return { error };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      toast({
        title: "Déconnexion réussie",
        description: "À bientôt !",
      });
      return { error: null };
    } catch (error: any) {
      toast({
        title: "Erreur de déconnexion",
        description: error.message,
        variant: "destructive",
      });
      return { error };
    }
  };

  return {
    user,
    session,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signInWithMicrosoft,
    signInWithApple,
    resetPassword,
    updatePassword,
    signOut,
  };
};
