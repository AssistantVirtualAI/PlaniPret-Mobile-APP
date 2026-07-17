import { useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Structured client-side auth logging so failures can be diagnosed from the console.
function logAuthError(op: string, error: any, extra?: Record<string, any>) {
  try {
    const details = {
      op,
      message: error?.message ?? String(error),
      name: error?.name,
      status: error?.status ?? error?.statusCode,
      code: error?.code ?? error?.error_code,
      details: error?.details ?? error?.error_description,
      ...extra,
    };
    // eslint-disable-next-line no-console
    console.error(`[auth:${op}]`, details, error);
  } catch { /* noop */ }
}

function friendlyAuthError(error: any): string {
  const msg = String(error?.message || "");
  const code = String(error?.code || error?.error_code || "");
  if (/invalid.login.credentials/i.test(msg) || code === "invalid_credentials") return "Email ou mot de passe invalide.";
  if (/email.not.confirmed/i.test(msg) || code === "email_not_confirmed") return "Email non confirmé. Vérifiez votre boîte de réception.";
  if (/user.already.registered/i.test(msg) || code === "user_already_exists") return "Ce compte existe déjà. Connectez-vous.";
  if (/rate.limit|over_email_send_rate_limit|too many/i.test(msg)) return "Trop de tentatives. Réessayez dans quelques minutes.";
  if (/network|failed to fetch/i.test(msg)) return "Problème réseau. Vérifiez votre connexion et réessayez.";
  if (/provider is not enabled|validation_failed/i.test(msg)) return "Ce fournisseur SSO n'est pas activé.";
  return msg || "Une erreur inattendue est survenue.";
}


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

        // Auto-link Microsoft 365 tokens when the user signed in via Azure SSO.
        // We defer to avoid blocking the auth callback, and only fire on
        // SIGNED_IN with a provider_token present.
        if (
          event === "SIGNED_IN" &&
          (session as any)?.provider_token &&
          (session?.user?.app_metadata?.provider === "azure" ||
            session?.user?.app_metadata?.provider === "microsoft")
        ) {
          setTimeout(() => {
            supabase.functions
              .invoke("ms365-store-session", {
                body: {
                  provider_token: (session as any).provider_token,
                  provider_refresh_token: (session as any).provider_refresh_token,
                  expires_in: (session as any).expires_in ?? 3600,
                  email: session.user?.email,
                  display_name:
                    session.user?.user_metadata?.full_name ??
                    session.user?.user_metadata?.name,
                },
              })
              .catch((err) => console.warn("[MS365 SSO link] failed:", err));
          }, 0);
        }
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
      logAuthError("signUp", error, { email });
      toast({
        title: "Erreur d'inscription",
        description: friendlyAuthError(error),
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
      logAuthError("signIn", error, { email });
      toast({
        title: "Erreur de connexion",
        description: friendlyAuthError(error),
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
      logAuthError("signInWithGoogle", error);
      toast({
        title: "Erreur de connexion Google",
        description: friendlyAuthError(error),
        variant: "destructive",
      });
      return { error };
    }
  };

  const signInWithMicrosoft = async () => {
    try {
      const scopes = [
        "openid",
        "profile",
        "email",
        "offline_access",
        "User.Read",
        "Mail.ReadWrite",
        "Mail.Send",
        "Calendars.ReadWrite",
        "Chat.ReadWrite",
        "ChatMessage.Send",
        "Contacts.ReadWrite",
        "Presence.Read.All",
      ].join(" ");

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          redirectTo: `${window.location.origin}/post-login`,
          scopes,
        },
      });

      if (error) throw error;
      return { error: null };
    } catch (error: any) {
      const msg = String(error?.message || "");
      const notEnabled = /provider is not enabled|Unsupported provider|validation_failed/i.test(msg);
      logAuthError("signInWithMicrosoft", error, { notEnabled });
      toast({
        title: notEnabled ? "Microsoft SSO indisponible" : "Erreur de connexion Microsoft",
        description: notEnabled
          ? "La connexion Microsoft n'est pas activée. Utilisez Google ou email/mot de passe. Vos intégrations Microsoft 365 restent disponibles une fois connecté."
          : friendlyAuthError(error),
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
      logAuthError("signInWithApple", error);
      toast({
        title: "Erreur de connexion Apple",
        description: friendlyAuthError(error),
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
