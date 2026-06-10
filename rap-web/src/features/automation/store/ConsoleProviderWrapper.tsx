import React from 'react';
import { ConsoleProvider } from './ConsoleContext';
import { useScriptExecution } from '../hooks/useScriptExecution';

export const ConsoleProviderWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { executionResult, setExecutionResult, selectedScript } = useScriptExecution();
  
  return (
    <ConsoleProvider 
      executionResult={executionResult} 
      setExecutionResult={setExecutionResult}
      selectedScript={selectedScript}
    >
      {children}
    </ConsoleProvider>
  );
};
