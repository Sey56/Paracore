import { useContext } from 'react';
import { ScriptContext, ScriptContextProps } from '../store/ScriptContext';

export const useScripts = (): ScriptContextProps => {
  const context = useContext(ScriptContext);
  if (!context) {
    throw new Error('useScripts must be used within a ScriptProvider');
  }
  return context;
};

export default useScripts;
