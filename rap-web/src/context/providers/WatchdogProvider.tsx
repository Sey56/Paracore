import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '@/api/axios';

export interface WatchdogStatus {
    script_path: string;
    script_name: string;
    summary: string;
    status: 'success' | 'warning' | 'error';
    details_json: string;
    timestamp: string;
}

interface WatchdogContextType {
    watchdogs: WatchdogStatus[];
    hasIssues: boolean;
}

const WatchdogContext = createContext<WatchdogContextType | undefined>(undefined);

export const WatchdogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [watchdogs, setWatchdogs] = useState<WatchdogStatus[]>([]);

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await api.get('/api/watchdogs');
                if (res.data && Array.isArray(res.data.watchdogs)) {
                    setWatchdogs(res.data.watchdogs);
                }
            } catch (err) {
                // Silently fail status polling
            }
        };

        const interval = setInterval(fetchStatus, 3000); // Poll every 3 seconds
        return () => clearInterval(interval);
    }, []);

    const hasIssues = watchdogs.some(w => w.status === 'warning' || w.status === 'error');

    return (
        <WatchdogContext.Provider value={{ watchdogs, hasIssues }}>
            {children}
        </WatchdogContext.Provider>
    );
};

export const useWatchdog = () => {
    const context = useContext(WatchdogContext);
    if (!context) throw new Error("useWatchdog must be used within a WatchdogProvider");
    return context;
};
