import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_STORAGE_KEY = '@goingplaces_user';

export type User = {
  id: string;
  firstName: string;
  lastName: string;
  avatar?: string;
};

type UserContextType = {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;
};

const UserContext = createContext<UserContextType | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setUser = useCallback(async (u: User | null) => {
    setUserState(u);
    if (u) {
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(u));
    } else {
      await AsyncStorage.removeItem(USER_STORAGE_KEY);
    }
  }, []);

  const logout = useCallback(() => setUser(null), []);

  useEffect(() => {
    AsyncStorage.getItem(USER_STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          setUserState(JSON.parse(raw));
        } catch {}
      }
      setIsLoading(false);
    });
  }, []);

  return (
    <UserContext.Provider value={{ user, isLoading, setUser, logout }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be within UserProvider');
  return ctx;
}
