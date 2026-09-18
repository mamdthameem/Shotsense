import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { AdminUser } from '../types';

interface AuthContextType {
  user: AdminUser | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isAdmin: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const displayName = (email: string | null): string => {
  if (!email) return 'Admin';
  const prefix = email.split('@')[0];
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
};

/** A signed-in account is only usable when it appears in admins/{uid} (in the
 *  (default) Firestore database). The rules only let admins read admins/, so
 *  for a non-admin the read is refused (permission-denied) rather than coming
 *  back empty — both mean "not an admin". */
const isListedAdmin = async (fbUser: FirebaseUser): Promise<boolean> => {
  try {
    const snap = await getDoc(doc(db, 'admins', fbUser.uid));
    return snap.exists();
  } catch (err) {
    if ((err as { code?: string }).code === 'permission-denied') return false;
    throw err;
  }
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setIsLoading(false);
        return;
      }
      try {
        if (await isListedAdmin(fbUser)) {
          setUser({ uid: fbUser.uid, email: fbUser.email ?? '', name: displayName(fbUser.email) });
        } else {
          await signOut(auth);
          setUser(null);
        }
      } catch {
        setUser(null);
      }
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (!(await isListedAdmin(credential.user))) {
        const uid = credential.user.uid;
        await signOut(auth);
        return { success: false, error: `This account does not have admin access (UID ${uid}).` };
      }
      return { success: true };
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        return { success: false, error: 'Invalid email or password' };
      }
      if (code === 'auth/too-many-requests') {
        return { success: false, error: 'Too many attempts. Try again later.' };
      }
      if (code === 'auth/network-request-failed' || code === 'unavailable') {
        return { success: false, error: 'Connection to authentication server failed' };
      }
      // Anything else: show the real code instead of a guess, so it can be diagnosed.
      return { success: false, error: `Sign-in failed${code ? ` (${code})` : ''}.` };
    }
  };

  const logout = () => {
    void signOut(auth);
  };

  const value: AuthContextType = {
    user,
    login,
    logout,
    isAdmin: user !== null,
    isLoading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
