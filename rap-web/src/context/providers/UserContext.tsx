
import { createContext, useContext } from 'react';
import { User } from '../authTypes';

interface UserContextProps {
  user: User | null;
}

export const UserContext = createContext<UserContextProps | undefined>(undefined);

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
