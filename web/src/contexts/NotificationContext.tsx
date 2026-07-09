import React, { createContext, useContext, useMemo } from 'react';
import { useClients } from './ClientsContext';
import { licenseStatusOf } from '../services/clientService';
import { formatDate, daysUntil } from '../utils/formatters';

export interface AppNotification {
  id: string;
  type: 'expiry' | 'info';
  title: string;
  message: string;
  severity: 'warning' | 'info' | 'error';
  createdAt: Date;
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const EXPIRY_WINDOW_DAYS = 14;

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { clients } = useClients();

  const notifications = useMemo((): AppNotification[] => {
    const list: AppNotification[] = [];

    for (const client of clients) {
      const status = licenseStatusOf(client);

      if (status === 'active' && client.licenseExpiresAt) {
        const d = daysUntil(client.licenseExpiresAt);
        if (d !== null && d >= 0 && d <= EXPIRY_WINDOW_DAYS) {
          const dayText = d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;
          list.push({
            id: `expiry-${client.id}`,
            type: 'expiry',
            title: 'License expiring',
            message: `${client.name} expires ${dayText} (${formatDate(client.licenseExpiresAt)})`,
            severity: d <= 3 ? 'warning' : 'info',
            createdAt: new Date(),
          });
        }
      }

      if (status === 'grace' || status === 'expired') {
        list.push({
          id: `expired-${client.id}`,
          type: 'expiry',
          title: status === 'grace' ? 'License in grace period' : 'License expired',
          message: `${client.name} — expired ${formatDate(client.licenseExpiresAt)}`,
          severity: 'warning',
          createdAt: new Date(),
        });
      }

      if (client.lastContactStatus === 'auth-failed') {
        list.push({
          id: `auth-${client.id}`,
          type: 'info',
          title: 'Gateway auth failed',
          message: `${client.name} rejected the stored API key on the last pull.`,
          severity: 'error',
          createdAt: new Date(),
        });
      }
    }

    return list;
  }, [clients]);

  const value: NotificationContextType = {
    notifications,
    unreadCount: notifications.length,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
