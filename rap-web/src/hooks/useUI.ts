import { useContext } from 'react';
import { UIContext, UIContextProps } from '@/context/providers/UIContext';

export const useUI = (): UIContextProps => {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};
