import { useContext } from 'react';
import { RevitContext, RevitContextProps } from '@/context/providers/RevitContext';

export const useRevitStatus = (): RevitContextProps => {
  const context = useContext(RevitContext);
  if (!context) {
    throw new Error('useRevitStatus must be used within a RevitProvider');
  }
  return context;
};

export default useRevitStatus;