import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { OnboardingStatus, User } from '../types';

const STORAGE_KEY = 'menusnap.userId';

interface UserContextValue {
  users: User[];
  currentUser: User | null;
  onboarding: OnboardingStatus | null;
  loading: boolean;
  error: string | null;
  selectUser: (userId: number) => void;
  createUser: (displayName: string) => Promise<User>;
  refresh: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | null>(null);

function readStoredUserId(): number | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(readStoredUserId);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listUsers();
      setUsers(list);

      if (currentUserId === null) {
        setCurrentUser(null);
        setOnboarding(null);
        return;
      }

      // A stored id can point at a user that no longer exists (e.g. after a database reset).
      const found = list.find((user) => user.id === currentUserId);
      if (!found) {
        window.localStorage.removeItem(STORAGE_KEY);
        setCurrentUserId(null);
        setCurrentUser(null);
        setOnboarding(null);
        return;
      }

      const detail = await api.getUser(currentUserId);
      setCurrentUser(detail.user);
      setOnboarding(detail.onboarding);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reach the MenuSnap API');
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectUser = useCallback((userId: number) => {
    window.localStorage.setItem(STORAGE_KEY, String(userId));
    setCurrentUserId(userId);
  }, []);

  const createUser = useCallback(
    async (displayName: string) => {
      const { user } = await api.createUser(displayName);
      selectUser(user.id);
      return user;
    },
    [selectUser],
  );

  const value = useMemo(
    () => ({ users, currentUser, onboarding, loading, error, selectUser, createUser, refresh }),
    [users, currentUser, onboarding, loading, error, selectUser, createUser, refresh],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used inside a UserProvider');
  return context;
}
