import React, { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldAlt, faCheckCircle, faExclamationCircle, faTimesCircle, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { useWatchdog, WatchdogStatus } from '@/context/providers/WatchdogProvider';

export const WatchdogIndicator: React.FC = () => {
    const { watchdogs, hasIssues } = useWatchdog();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (watchdogs.length === 0) return null;

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'success': return 'text-green-500';
            case 'warning': return 'text-amber-500';
            case 'error': return 'text-red-500';
            default: return 'text-gray-400';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'success': return faCheckCircle;
            case 'warning': return faExclamationCircle;
            case 'error': return faTimesCircle;
            default: return faShieldAlt;
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-500 ${hasIssues ? 'bg-amber-50 dark:bg-amber-900/20 animate-pulse border border-amber-200 dark:border-amber-800' : 'bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700'}`}
                title="BIM Watchdog Status"
            >
                <FontAwesomeIcon 
                    icon={faShieldAlt} 
                    className={`${hasIssues ? 'text-amber-500' : 'text-blue-500'} text-sm`} 
                />
                <span className="text-[10px] font-black uppercase tracking-tight text-gray-600 dark:text-gray-300">
                    {watchdogs.length} Active
                </span>
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-3 w-80 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                    <div className="p-4 border-b border-gray-50 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Model Health Monitor</h3>
                    </div>
                    
                    <div className="max-h-96 overflow-y-auto custom-scrollbar">
                        {watchdogs.map((w, idx) => (
                            <div key={idx} className="p-4 border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3">
                                        <FontAwesomeIcon icon={getStatusIcon(w.status)} className={`${getStatusColor(w.status)} mt-0.5 text-base`} />
                                        <div>
                                            <div className="text-xs font-bold text-gray-900 dark:text-gray-100">{w.script_name}</div>
                                            <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 font-medium leading-relaxed">{w.summary}</div>
                                        </div>
                                    </div>
                                    <button className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-blue-500 transition-all">
                                        <FontAwesomeIcon icon={faChevronRight} className="text-[10px]" />
                                    </button>
                                </div>
                                <div className="mt-2 flex items-center justify-between text-[8px] font-bold text-gray-400 uppercase tracking-tighter">
                                    <span>Last Run: {new Date(w.timestamp).toLocaleTimeString()}</span>
                                    {w.status !== 'success' && <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">Action Required</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
