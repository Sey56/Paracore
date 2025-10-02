
import React, { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { UserContext } from './UserContext';

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  return (
    <UserContext.Provider value={{ user }}>
      {children}
    </UserContext.Provider>
  );
};
