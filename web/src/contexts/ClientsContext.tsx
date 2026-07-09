import React, { createContext, useContext, useEffect, useState } from 'react';
import { subscribeClients } from '../services/clientService';
import type { Client } from '../types';
import { useAuth } from './AuthContext';

interface ClientsContextType {
  clients: Client[];
  loading: boolean;
  error: string | null;
}

const ClientsContext = createContext<ClientsContextType | undefined>(undefined);

/** Single live subscription to the registry, shared by all screens. */
export const ClientsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setClients([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = subscribeClients(
      (list) => {
        setClients(list);
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user?.uid]);

  return (
    <ClientsContext.Provider value={{ clients, loading, error }}>
      {children}
    </ClientsContext.Provider>
  );
};

export const useClients = (): ClientsContextType => {
  const context = useContext(ClientsContext);
  if (context === undefined) {
    throw new Error('useClients must be used within a ClientsProvider');
  }
  return context;
};
