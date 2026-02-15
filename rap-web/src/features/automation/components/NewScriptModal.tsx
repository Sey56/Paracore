import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faCode, faCogs, faFileCode, faFilter, faLayerGroup, faBolt, faTable, faInfoCircle, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { useScripts } from '../hooks/useScripts';
import { useScriptExecution } from '../hooks/useScriptExecution';
import { VisualQueryBuilder } from './VisualQueryBuilder';
import { Script } from '@/types/scriptModel';
import { Modal } from '@/components/common/Modal';
import api from '@/api/axios';

interface NewScriptModalProps {
  isOpen: boolean;
  onClose: (createdScript?: Script) => void;
  replaceTarget?: string;
  selectedFolder?: string;
  scriptToReplace?: Script | null;
}

export const NewScriptModal = ({ isOpen, onClose, replaceTarget, selectedFolder, scriptToReplace }: NewScriptModalProps) => {
  const { createNewScript } = useScripts();
  const targetPath = replaceTarget || scriptToReplace?.absolutePath;
  const isReplacing = !!targetPath;
  const { resetScriptParameters } = useScriptExecution();
  
  const [scriptName, setScriptName] = useState('');
  const [activeTab, setActiveTab] = useState<'query' | 'template' | 'blank'>('query');
  const [selectedTemplate, setSelectedTemplate] = useState('BIMWatchdog');
  
  const [generatedLogic, setGeneratedLogic] = useState('');
  const [generatedParams, setGeneratedParams] = useState('');
  const [isCompiled, setIsCompiled] = useState(false);
  const [initialQueryState, setInitialQueryState] = useState<any>(undefined);
  const [showConfirmReplace, setShowConfirmReplace] = useState(false);

  // Persistence Logic: Load existing query if replacing
  useEffect(() => {
    if (isOpen && targetPath) {
        const fetchExisting = async () => {
            try {
                const response = await api.get(`/api/script-content?scriptPath=${encodeURIComponent(targetPath)}`);
                const content = response.data.sourceCode as string;
                
                const match = content.match(/\/\/ __PARACORE_QUERY_DATA__(.*)/);
                if (match && match[1]) {
                    try {
                        const rawJson = match[1].trim();
                        const state = JSON.parse(rawJson);
                        setInitialQueryState(state);
                        setActiveTab('query');
                    } catch (e) {
                        console.error("[NewScriptModal] Failed to parse query metadata", e);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch script content for persistence:", err);
            }
        };
        fetchExisting();
    } else if (isOpen) {
        setScriptName('');
        setGeneratedLogic('');
        setGeneratedParams('');
        setIsCompiled(false);
        setInitialQueryState(undefined);
        setActiveTab('query');
    }
  }, [isOpen, targetPath]);

  const handleExecuteAction = async () => {
    if (isReplacing && targetPath) {
        try {
            const response = await api.post("/api/scripts/replace-code", {
                script_path: targetPath,
                new_logic: generatedLogic,
                new_params: generatedParams
            });
            
            if (response.status === 200 || response.status === 201) {
                if (scriptToReplace?.id) {
                    await resetScriptParameters(scriptToReplace.id);
                }
                setShowConfirmReplace(false);
                // Return the fresh script object from the response
                onClose(response.data as Script);
            }
        } catch (err) {
            console.error("Failed to replace script code:", err);
        }
    } else {
        if (!scriptName) return;
        try {
            const result = await createNewScript({
                script_name: scriptName,
                template_id: activeTab === 'query' ? 'ProjectAuditor' : selectedTemplate,
                generated_logic: generatedLogic,
                generated_params: generatedParams,
                parent_folder: selectedFolder
            });
            
            if (result) {
                setShowConfirmReplace(false);
                onClose(result);
            }
        } catch (err) {
            console.error("Failed to create new script:", err);
        }
    }
  };

  const handleMainActionClick = () => {
      if (isReplacing) {
          setShowConfirmReplace(true);
      } else {
          handleExecuteAction();
      }
  };

  const modalTitle = isReplacing ? `Refine Automation` : 'New Automation';

  return (
    <>
        <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size="full">
        <div className="flex flex-col h-full bg-white dark:bg-gray-900">
            
            {/* Toolbar & Name Input */}
            <div className="px-8 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-white dark:bg-gray-900 shrink-0">
            <div className="flex items-center gap-6 flex-1">
                {!isReplacing ? (
                <div className="flex flex-col w-1/3 min-w-[300px]">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Tool Name</label>
                    <input
                    autoFocus
                    type="text"
                    value={scriptName}
                    onChange={(e) => setScriptName(e.target.value)}
                    placeholder="e.g. Audit Fire Ratings..."
                    className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                </div>
                ) : (
                <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/50">
                    <FontAwesomeIcon icon={faCogs} className="text-blue-500 text-sm" />
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">Updating Target</span>
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate max-w-[300px]">{targetPath?.split(/[\\/]/).pop()}</span>
                    </div>
                </div>
                )}
            </div>

            {/* Clean Segmented Tabs */}
            <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                {[
                    { id: 'query', label: 'Visual Builder', icon: faFilter },
                    { id: 'template', label: 'Templates', icon: faLayerGroup },
                    { id: 'blank', label: 'Blank Script', icon: faCode }
                ].map((tab) => (
                    <button 
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
                            activeTab === tab.id 
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' 
                            : 'text-gray-400 hover:text-gray-600'
                        }`}
                    >
                        <FontAwesomeIcon icon={tab.icon} className={activeTab === tab.id ? 'text-blue-500' : ''} />
                        {tab.label}
                    </button>
                ))}
            </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 min-h-0 bg-white dark:bg-gray-900">
                <div className="max-w-7xl mx-auto">
                    {activeTab === 'query' && (
                        <VisualQueryBuilder 
                            key={initialQueryState ? 'persistent' : 'new'}
                            initialState={initialQueryState}
                            onQueryGenerated={(logic, params, compiled) => {
                                setGeneratedLogic(logic);
                                setGeneratedParams(params);
                                setIsCompiled(compiled);
                            }} 
                        />
                    )}

                    {activeTab === 'template' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-1">
                                {[
                                    { id: 'BIMWatchdog', label: 'BIM Watchdog', desc: 'Runs silently in the background to validate models when Revit is idle.', icon: faBolt, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/20' },
                                    { id: 'ExcelLink', label: 'Excel Live Link', desc: 'Bidirectional sync between Revit elements and external spreadsheets.', icon: faTable, color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-900/20' },
                                ].map(t => (
                                    <div 
                                        key={t.id}
                                        onClick={() => setSelectedTemplate(t.id)}
                                        className={`relative p-6 rounded-xl border-2 cursor-pointer transition-all flex gap-5 items-start group ${selectedTemplate === t.id ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/10' : 'border-gray-100 dark:border-gray-800 hover:border-blue-300 bg-white dark:bg-gray-800/50'}`}
                                    >
                                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${t.bg}`}>
                                            <FontAwesomeIcon icon={t.icon} className={`${t.color} text-lg`} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-gray-900 dark:text-gray-100 text-base">{t.label}</div>
                                            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{t.desc}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'blank' && (
                        <div className="flex items-center justify-center p-20">
                            <div className="max-w-lg w-full text-center p-10 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                                <FontAwesomeIcon icon={faFileCode} className="text-gray-400 text-4xl mb-4" />
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Empty C# Logic</h3>
                                <p className="text-sm text-gray-500 mt-2">Start with a blank canvas for custom Revit API development.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Action Footer */}
            <div className="px-8 py-5 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3 bg-white dark:bg-gray-900 shrink-0">
            <button onClick={() => onClose()} className="px-6 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
            <button
                onClick={handleMainActionClick}
                disabled={(!scriptName && !isReplacing) || (activeTab === 'query' && !isCompiled)}
                className="px-8 py-2.5 rounded-lg text-sm font-bold bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-all disabled:opacity-50 active:scale-95"
            >
                {isReplacing ? 'Confirm Changes' : 'Create Tool'}
            </button>
            </div>
        </div>
        </Modal>

        {/* Surgical Replace Confirmation Modal */}
        {showConfirmReplace && (
            <Modal isOpen={showConfirmReplace} onClose={() => setShowConfirmReplace(false)} title="Confirm Script Update" size="md">
                <div className="space-y-6">
                    <div className="flex items-center gap-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl">
                        <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-800 flex items-center justify-center flex-shrink-0">
                            <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-600 dark:text-amber-400 text-lg" />
                        </div>
                        <div>
                            <div className="text-sm font-black text-amber-800 dark:text-amber-200 uppercase">Warning: Surgical Injection</div>
                            <p className="text-xs text-amber-700/70 dark:text-amber-400/70 font-bold mt-0.5">This will overwrite the current filtering logic and parameters. IDE scaffolding will be preserved.</p>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button onClick={() => setShowConfirmReplace(false)} className="px-6 py-2 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-100 transition-all">Go Back</button>
                        <button onClick={handleExecuteAction} className="px-6 py-2 rounded-lg text-xs font-black bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-all">Overwrite Logic</button>
                    </div>
                </div>
            </Modal>
        )}
    </>
  );
};
