import React, { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faComments, faChevronDown, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import { AgentSession } from '../utils/sessionStorage';
import { TokenUsage } from '../types/agentTypes';

interface SessionHeaderProps {
  sessions: AgentSession[];
  activeSessionId: string;
  activeSession: AgentSession | undefined;
  cumulativeUsage: TokenUsage;
  onNewSession: () => void;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onOpenDeleteModal: () => void;
}

export const SessionHeader: React.FC<SessionHeaderProps> = ({
  sessions, activeSessionId, activeSession, cumulativeUsage,
  onNewSession, onSwitchSession, onDeleteSession, onOpenDeleteModal,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  return (
    <div className="flex-shrink-0 flex justify-between items-center px-4 h-12 bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-gray-700 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] flex-shrink-0" />
        <span className="text-[9px] font-medium text-slate-300 dark:text-slate-600 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded tabular-nums">{sessions.length}</span>
        <div className="relative" ref={menuRef}>
          <button onClick={() => setShowMenu(!showMenu)}
            className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate max-w-[200px]"
            title={activeSession?.name || 'Sessions'}>
            <FontAwesomeIcon icon={faComments} className="text-[10px] text-slate-400 shrink-0" />
            <span className="truncate">{activeSession?.name || 'Chat'}</span>
            <FontAwesomeIcon icon={faChevronDown} className={`text-[7px] text-slate-400 transition-transform ${showMenu ? 'rotate-180' : ''}`} />
          </button>
          {showMenu && (
            <div className="absolute left-0 top-full mt-1 w-64 bg-white dark:bg-slate-900 rounded-xl shadow-2xl z-[60] border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="max-h-64 overflow-y-auto custom-scrollbar">
                {sessions.slice().sort((a, b) => b.updatedAt - a.updatedAt).map((s, i) => (
                  <div key={s.id} className="flex items-center group border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                    <button onClick={() => { onSwitchSession(s.id); setShowMenu(false); }}
                      className={`flex-1 text-left px-4 py-2.5 flex items-center gap-2 min-w-0 ${s.id === activeSessionId ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.id === activeSessionId ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                      <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate">{s.name || `Session ${i + 1}`}</span>
                      <span className="text-[9px] text-slate-400 ml-auto shrink-0 tabular-nums">{s.messageCount}</span>
                    </button>
                    {sessions.length > 1 && (
                      <button onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id); }}
                        className="px-2 py-2 text-slate-300 hover:text-red-500 transition-colors shrink-0 opacity-0 group-hover:opacity-100" title="Delete session">
                        <FontAwesomeIcon icon={faTrash} className="text-[9px]" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-100 dark:border-slate-800">
                <button onClick={() => { onNewSession(); setShowMenu(false); }}
                  className="w-full text-left px-4 py-2.5 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2 transition-colors">
                  <FontAwesomeIcon icon={faPlus} className="text-[10px]" /> New Chat
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {cumulativeUsage.total_tokens > 0 && (
        <div className="relative group/tokens flex items-center gap-2 text-[10px] font-mono text-slate-400 dark:text-slate-500 shrink-0 cursor-default">
          <span className="tabular-nums">↑{cumulativeUsage.input_tokens >= 1000 ? `${(cumulativeUsage.input_tokens / 1000).toFixed(1)}k` : cumulativeUsage.input_tokens}</span>
          <span className="tabular-nums">↓{cumulativeUsage.output_tokens >= 1000 ? `${(cumulativeUsage.output_tokens / 1000).toFixed(1)}k` : cumulativeUsage.output_tokens}</span>
          <div className="absolute z-[130] left-1/2 -translate-x-1/2 top-full mt-2 p-2 rounded-lg shadow-xl bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-[10px] font-sans font-medium leading-relaxed w-48 opacity-0 invisible group-hover/tokens:opacity-100 group-hover/tokens:visible transition-all duration-200 pointer-events-none border border-slate-200 dark:border-slate-700 text-center">
            ↑ {cumulativeUsage.input_tokens.toLocaleString()} input<br />
            ↓ {cumulativeUsage.output_tokens.toLocaleString()} output<br />
            {cumulativeUsage.requests} request{cumulativeUsage.requests !== 1 ? 's' : ''}
          </div>
        </div>
      )}
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onNewSession} className="p-1.5 text-slate-400 hover:text-blue-500 transition-colors" title="New Chat">
          <FontAwesomeIcon icon={faPlus} className="text-xs" />
        </button>
        <button onClick={onOpenDeleteModal} title="Delete Session" className="p-1.5 text-slate-400 hover:text-red-500 transition-colors">
          <FontAwesomeIcon icon={faTrash} className="text-xs" />
        </button>
      </div>
    </div>
  );
};
