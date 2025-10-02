import { useContext } from 'react';
import { LocalScriptsContext } from '@/context/localScriptsTypes';

export const useLocalScripts = () => {
  const context = useContext(LocalScriptsContext);
  if (context === undefined) {
    throw new Error('useLocalScripts must be used within a LocalScriptsProvider');
  }
  return context;
};
