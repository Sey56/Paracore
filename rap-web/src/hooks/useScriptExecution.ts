
import { useContext } from 'react';
import { ScriptExecutionContext, ScriptExecutionContextProps } from '@/context/providers/ScriptExecutionContext';

export const useScriptExecution = (): ScriptExecutionContextProps => {
  const context = useContext(ScriptExecutionContext);
  if (!context) {
    throw new Error('useScriptExecution must be used within a ScriptExecutionProvider');
  }
  return context;
};

export default useScriptExecution;
