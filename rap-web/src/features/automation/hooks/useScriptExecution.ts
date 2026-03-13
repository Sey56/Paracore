import { useContext } from 'react';
import { 
  ScriptExecutionContext,
  ScriptSelectionContext,
  ScriptExecutionStateContext,
  ScriptDataContext,
  ScriptOperationsContext
} from '../store/ScriptExecutionContext';

/**
 * LEGACY HOOK
 * Provides everything. Use only if necessary for backward compatibility.
 * Causes re-renders on ANY change in execution state.
 */
export const useScriptExecution = () => {
  const context = useContext(ScriptExecutionContext);
  if (context === undefined) {
    throw new Error('useScriptExecution must be used within a ScriptExecutionProvider');
  }
  return context;
};

/**
 * FOCUSED SELECTION HOOK
 * Only re-renders when the selected script changes.
 */
export const useScriptSelection = () => {
  const context = useContext(ScriptSelectionContext);
  if (context === undefined) {
    throw new Error('useScriptSelection must be used within a ScriptExecutionProvider');
  }
  return context;
};

/**
 * FOCUSED EXECUTION STATE HOOK
 * Re-renders on every execution start/stop/result.
 */
export const useExecutionState = () => {
  const context = useContext(ScriptExecutionStateContext);
  if (context === undefined) {
    throw new Error('useExecutionState must be used within a ScriptExecutionProvider');
  }
  return context;
};

/**
 * FOCUSED DATA HOOK
 * Re-renders when parameters or metadata changes.
 */
export const useScriptData = () => {
  const context = useContext(ScriptDataContext);
  if (context === undefined) {
    throw new Error('useScriptData must be used within a ScriptExecutionProvider');
  }
  return context;
};

/**
 * FOCUSED OPERATIONS HOOK
 * Static context. Components using this NEVER re-render due to execution state changes.
 * Perfect for buttons and action handlers.
 */
export const useScriptOperations = () => {
  const context = useContext(ScriptOperationsContext);
  if (context === undefined) {
    throw new Error('useScriptOperations must be used within a ScriptExecutionProvider');
  }
  return context;
};
