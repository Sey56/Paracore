
import React, { ReactNode, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { UserContext } from './UserContext';

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const contextValue = useMemo(() => ({ user }), [user]);

  return (
    <UserContext.Provider value={contextValue}>
      {children}
    </UserContext.Provider>
  );
};
