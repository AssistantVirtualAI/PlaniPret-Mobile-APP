import React, { createContext, useContext, ReactNode } from 'react';
import { useClientAuth, ClientSession } from '@/hooks/useClientAuth';

interface ClientContextType {
  session: ClientSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (loginId: string, password: string) => Promise<ClientSession>;
  loginAsAdmin: (clientId: string) => Promise<ClientSession | null>;
  logout: () => void;
}

const ClientContext = createContext<ClientContextType | undefined>(undefined);

export const ClientProvider = ({ children }: { children: ReactNode }) => {
  const auth = useClientAuth();

  return (
    <ClientContext.Provider value={auth}>
      {children}
    </ClientContext.Provider>
  );
};

export const useClient = () => {
  const context = useContext(ClientContext);
  if (!context) {
    throw new Error('useClient must be used within a ClientProvider');
  }
  return context;
};
