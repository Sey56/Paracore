import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ExecutionResult } from "@/types/common";
import type { Script } from "@/types/scriptModel";
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { useUI } from '@/hooks/useUI';
import { AuthContext } from '@/features/auth/store/AuthContext';
import { trackEvent } from '@/utils/telemetry';
import { save, open } from '@tauri-apps/api/dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/api/fs';

export type ConsoleItemType = 'input' | 'output' | 'error' | 'status';

export interface ConsoleItem {
  type: ConsoleItemType;
  text: string;
  timestamp: Date;
  replType?: 'single' | 'multi';
}

interface ConsoleContextType {
  localHistory: ConsoleItem[];
  setLocalHistory: React.Dispatch<React.SetStateAction<ConsoleItem[]>>;
  handleClear: () => void;
  
  singleLineValue: string;
  setSingleLineValue: (val: string) => void;
  multiLineValue: string;
  setMultiLineValue: (val: string) => void;
  
  isMultiLine: boolean;
  setIsMultiLine: (val: boolean) => void;
  
  isReplLoading: boolean;
  handleReplSubmit: (isMulti: boolean, activeSnippetName?: string | null) => Promise<void>;
  
  singleCommandHistory: string[];
  multiCommandHistory: string[];
  
  activeSnippetPath: string | null;
  setActiveSnippetPath: (val: string | null) => void;
  activeSnippetName: string | null;
  setActiveSnippetName: (val: string | null) => void;
  isDirty: boolean;

  // Snippet Handlers
  handleNewSnippet: () => void;
  handleLoadSnippet: () => Promise<void>;
  handleSaveSnippet: (forceSaveAs?: boolean) => Promise<boolean>;
}

const ConsoleContext = createContext<ConsoleContextType | undefined>(undefined);

export const useConsole = () => {
  const context = useContext(ConsoleContext);
  if (!context) throw new Error("useConsole must be used within a ConsoleProvider");
  return context;
};

export const ConsoleProvider: React.FC<{ 
  children: React.ReactNode,
  executionResult: ExecutionResult | null,
  setExecutionResult: (res: ExecutionResult | null) => void,
  selectedScript: Script | null
}> = ({ children, executionResult, setExecutionResult, selectedScript }) => {
  const { showNotification } = useNotifications();
  const { revitStatus } = useRevitStatus();
  const authContext = React.useContext(AuthContext);
  const isEnterprise = authContext?.isEnterprise ?? false;
  
  const [localHistory, setLocalHistory] = useState<ConsoleItem[]>(() => {
    const saved = localStorage.getItem('paracore_console_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((item: any) => ({ ...item, timestamp: new Date(item.timestamp) }));
      } catch { return []; }
    }
    return [];
  });

  const [singleLineValue, setSingleLineValue] = useState(() => localStorage.getItem('paracore_repl_single_value') || "");
  const [multiLineValue, setMultiLineValue] = useState(() => localStorage.getItem('paracore_repl_multi_value') || "");
  const [isMultiLine, setIsMultiLine] = useState(() => localStorage.getItem('paracore_repl_multiline') === 'true');
  const [isReplLoading, setIsReplLoading] = useState(false);
  
  const [activeSnippetPath, setActiveSnippetPath] = useState<string | null>(() => localStorage.getItem('paracore_repl_active_path'));
  const [activeSnippetName, setActiveSnippetName] = useState<string | null>(() => {
    const saved = localStorage.getItem('paracore_repl_active_name');
    return saved === "Multi-Line REPL" ? null : saved;
  });
  const [lastSavedValue, setLastSavedValue] = useState<string>(() => localStorage.getItem('paracore_repl_multi_value') || "");

  const [singleCommandHistory, setSingleCommandHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem('paracore_repl_single_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [multiCommandHistory, setMultiCommandHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem('paracore_repl_multi_history');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => { localStorage.setItem('paracore_console_history', JSON.stringify(localHistory)); }, [localHistory]);
  useEffect(() => { localStorage.setItem('paracore_repl_single_history', JSON.stringify(singleCommandHistory)); }, [singleCommandHistory]);
  useEffect(() => { localStorage.setItem('paracore_repl_multi_history', JSON.stringify(multiCommandHistory)); }, [multiCommandHistory]);
  useEffect(() => { localStorage.setItem('paracore_repl_single_value', singleLineValue); }, [singleLineValue]);
  useEffect(() => { localStorage.setItem('paracore_repl_multi_value', multiLineValue); }, [multiLineValue]);
  useEffect(() => { localStorage.setItem('paracore_repl_multiline', String(isMultiLine)); }, [isMultiLine]);
  
  useEffect(() => {
    if (activeSnippetPath) localStorage.setItem('paracore_repl_active_path', activeSnippetPath);
    else localStorage.removeItem('paracore_repl_active_path');
  }, [activeSnippetPath]);
  
  useEffect(() => {
    if (activeSnippetName) localStorage.setItem('paracore_repl_active_name', activeSnippetName);
    else localStorage.removeItem('paracore_repl_active_name');
  }, [activeSnippetName]);

  const handleClear = useCallback(() => {
    setLocalHistory([]);
    setExecutionResult(null);
    localStorage.removeItem('paracore_console_history');
    localStorage.removeItem('paracore_console_last_timestamp');
    showNotification("Console and Analytics cleared", "info");
  }, [showNotification, setExecutionResult]);

  const handleReplSubmit = async (isMulti: boolean, activeName?: string | null) => {
    const command = isMulti ? multiLineValue.trim() : singleLineValue.trim();
    if (!command || isReplLoading) return;

    const currentReplType = (isMulti ? 'multi' : 'single') as 'multi' | 'single';

    if (command.toLowerCase() === 'help' || command === '?') {
      const helpInput: ConsoleItem = { type: 'input', text: 'Help', timestamp: new Date(), replType: currentReplType };
      const P = 47;
      const h = (cmd: string, desc: string) => `  ${cmd}`.padEnd(P) + desc;
      const helpText = [
        "━".repeat(P + 16),
        "  📖 PARACORE REPL — QUICK REFERENCE",
        "━".repeat(P + 16),
        "",
        "🔍 DISCOVERY",
        h('GetElements("Walls")',                    'All walls (generic)'),
        h('GetElements<Wall>()',                     'All walls (typed)'),
        h('GetElements<FamilyInstance>("Doors")',     'Typed + filtered'),
        h('GetElement("name")',                      'Find one by name'),
        h('Selection',                               'Current Revit selection'),
        h('Selection[0]',                            'First selected element'),
        "",
        "📥 READ PARAMETERS",
        h('el.GetStr("Level")',                      '→ "Level 1"'),
        h('el.GetNum("Area", "m2")',                 '→ 25.46'),
        h('el.GetVal("Area")',                       '→ "25.46 m²" (as in Revit)'),
        h('el.GetInt("Is External")',                '→ 1 (yes/no)'),
        h('el.GetTypeNum("Width", "mm")',            '→ 900.0 (from Type)'),
        "",
        "✏️ WRITE",
        h('el.SetVal("Comments", "Done")',           'Smart setter'),
        h('el.SetVal("Level", "Level 2")',           'Resolves ElementId'),
        h('el.SetNum("Offset", 500, "mm")',          'Unit-aware setter'),
        h('.SetParam("Mark", "W-01")',               'Bulk set on collection'),
        "",
        "🗂️ FILTER",
        h('.WhereParam("Level", "Level 1")',         'Exact match'),
        h('.WhereParam("Mark", "starts", "D-")',     'String operation'),
        h('.WhereParam("Area", ">", 25, "m2")',      'Numeric comparison'),
        h('.WhereMatches("Single-Flush")',           'Fuzzy name match'),
        h('.Where(w => w.Width > 0.5)',              'Lambda (typed mode)'),
        "",
        "🔼 SORT & GROUP",
        h('.OrderByParam("Area")',                   'Ascending (auto-numeric)'),
        h('.OrderByParamDesc("Area")',               'Descending'),
        h('.GroupByParam("Level")',                   '→ Group | Count'),
        h('.GroupByParam("Level", "Area", "m2")',     '→ Group | Count | Total'),
        h('.SumParam("Length", "m")',                 '→ Total as double'),
        "",
        "📈 VISUALIZE",
        h('.Table()',                                 'Interactive data grid'),
        h('.BarChart() / .PieChart() / .LineChart()', 'Charts'),
        h('.Select(r => new { ... }).Table()',        'Custom projections'),
        "",
        "🖱️ REVIT UI",
        h('.Select()',                               'Select in Revit UI'),
        h('.Zoom()',                                 'Zoom to elements'),
        h('.Isolate()',                              'Isolate in view'),
        h('.Hide() / .Unhide()',                     'Toggle visibility'),
        h('.Delete()',                               'BIM-safe delete'),
        "",
        "⚖️ UNITS",
        h('10.InputUnit("m2")',                      'User → internal feet'),
        h('val.OutputUnit("mm", 2)',                 'Internal → display'),
        h('val.FormatUnit("mm")',                    '→ "3600.0 mm"'),
        "",
        "🔎 DIAGNOSTICS",
        h('el.Peek()',                               'Full parameter audit'),
        h('el.CombinedParams().Table()',             'Instance + Type params'),
        h('el.BuiltInParams().Table()',              'All BIP identifiers'),
        "",
        "🛠️ SYSTEM",
        h('Transact("name", () => { ... })',         'Wrap model changes'),
        h('vars / list',                             'Show session variables'),
        h('clear vars / reset',                      'Reset REPL memory'),
        h('clear / cls',                             'Clear console'),
        h('help / ?',                                'This reference'),
        "━".repeat(P + 16),
      ].join("\n");
      const helpOutput: ConsoleItem = { type: 'output', text: helpText, timestamp: new Date(), replType: currentReplType };
      
      setLocalHistory(prev => [...prev, helpInput, helpOutput].slice(-100));
      if (!isMulti) setSingleLineValue(""); 
      return;
    }

    if (command.toLowerCase() === 'clear' || command.toLowerCase() === 'cls') {
      setLocalHistory([]);
      localStorage.removeItem('paracore_console_history');
      if (!isMulti) setSingleLineValue("");
      showNotification("Console history cleared", "info");
      return;
    }
    
    if (!isMulti) setSingleLineValue("");
    setIsReplLoading(true);
    const sanitizedActiveName = activeName === "Multi-Line REPL" ? null : activeName;
    const identifier = isMulti ? (sanitizedActiveName || "REPL Playground") : command;
    const statusItem: ConsoleItem = { type: 'status', text: `> ${identifier}`, timestamp: new Date(), replType: currentReplType };
    setLocalHistory(prev => [...prev, statusItem].slice(-100));
    
    if (isMulti) setMultiCommandHistory(prev => [command, ...prev.filter(c => c !== command)].slice(0, 50));
    else setSingleCommandHistory(prev => [command, ...prev.filter(c => c !== command)].slice(0, 50));

    trackEvent('repl_executed', { repl_type: currentReplType });

    const capturedDocTitle = revitStatus.document ? revitStatus.document.split(/[\\/]/).pop() || null : null;

    try {
      const response = await api.post("/api/repl", { code: command, session_id: "global", license_tier: isEnterprise ? "enterprise" : "free" });
      if (response.data.is_success) {
        setExecutionResult({ 
          output: response.data.output || '', 
          isSuccess: true, 
          error: null, 
          structuredOutput: response.data.structured_output || [], 
          internalData: `REPL_${currentReplType.toUpperCase()}`, 
          timestamp: Date.now(), 
          scriptName: isMulti ? identifier : "REPL",
          capturedDocTitle
        });
      } else {
        setExecutionResult({ 
          output: response.data.output || '', 
          isSuccess: false, 
          error: response.data.error_message || 'Error', 
          structuredOutput: [], 
          internalData: `REPL_${currentReplType.toUpperCase()}`, 
          timestamp: Date.now(), 
          scriptName: isMulti ? identifier : "REPL",
          capturedDocTitle
        });
      }
    } catch (err: any) {
      const errorItem: ConsoleItem = { type: 'error', text: `Error: ${err.message}`, timestamp: new Date(), replType: currentReplType };
      setLocalHistory(prev => [...prev, errorItem].slice(-100));
    } finally {
      setIsReplLoading(false);
    }
  };

  const handleSaveSnippet = async (forceSaveAs: boolean = false): Promise<boolean> => {
    if (!multiLineValue.trim()) return false;
    try {
      let targetPath = activeSnippetPath;
      if (forceSaveAs || !targetPath) {
        targetPath = await save({
          filters: [{ name: 'C# Script', extensions: ['cs'] }],
          defaultPath: activeSnippetName ? `${activeSnippetName}.cs` : 'MyReplSnippet.cs'
        });
      }
      if (targetPath) {
        setActiveSnippetPath(targetPath);
        setLastSavedValue(multiLineValue);
        const filename = targetPath.split(/[\\/]/).pop()?.replace('.cs', '') || "Snippet";
        setActiveSnippetName(filename);
        await writeTextFile(targetPath, multiLineValue);
        showNotification(forceSaveAs ? "Saved As" : "Saved", "success");
        return true;
      }
      return false;
    } catch (err: any) { showNotification(err.message, "error"); return false; }
  };

  const handleNewSnippet = () => {
    setMultiLineValue("");
    setLastSavedValue("");
    setActiveSnippetPath(null);
    setActiveSnippetName(null);
    showNotification("New snippet created", "info");
  };

  const handleLoadSnippet = async () => {
    try {
      const sel = await open({ multiple: false, filters: [{ name: 'C# Script', extensions: ['cs'] }] });
      if (sel && typeof sel === 'string') {
        const content = await readTextFile(sel);
        setMultiLineValue(content);
        setLastSavedValue(content);
        setActiveSnippetPath(sel);
        const filename = sel.split(/[\\/]/).pop()?.replace('.cs', '') || "Snippet";
        setActiveSnippetName(filename);
        showNotification("Loaded", "success");
      }
    } catch (err: any) { showNotification(err.message, "error"); }
  };

  // Process execution results into history
  const lastProcessedTimestampRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!executionResult) return;
    if (executionResult.timestamp === lastProcessedTimestampRef.current) return;
    
    lastProcessedTimestampRef.current = executionResult.timestamp;
    
    const internalData = executionResult.internalData || "";
    const isRepl = internalData.startsWith('REPL');
    const replType: 'single' | 'multi' | undefined = isRepl ? (internalData.includes('MULTI') ? 'multi' : 'single') : undefined;

    const newItems: ConsoleItem[] = [];

    // IF NOT REPL, add status marker for the script execution start
    if (!isRepl) {
        const scriptName = executionResult.scriptName || "Script";
        newItems.push({ type: 'status', text: `> ${scriptName}`, timestamp: new Date() });
    }

    if (executionResult.output) {
      newItems.push({ type: 'output', text: String(executionResult.output), timestamp: new Date(), replType });
    }
    if (executionResult.error) {
      newItems.push({ type: 'error', text: String(executionResult.error), timestamp: new Date(), replType });
    }

    if (newItems.length > 0) {
        setLocalHistory(prev => [...prev, ...newItems].slice(-100));
    }
  }, [executionResult]);

  const isDirty = multiLineValue !== lastSavedValue;

  return (
    <ConsoleContext.Provider value={{
      localHistory, setLocalHistory, handleClear,
      singleLineValue, setSingleLineValue,
      multiLineValue, setMultiLineValue,
      isMultiLine, setIsMultiLine,
      isReplLoading, handleReplSubmit,
      singleCommandHistory, multiCommandHistory,
      activeSnippetPath, setActiveSnippetPath,
      activeSnippetName, setActiveSnippetName,
      isDirty,
      handleNewSnippet, handleLoadSnippet, handleSaveSnippet
    }}>
      {children}
    </ConsoleContext.Provider>
  );
};
