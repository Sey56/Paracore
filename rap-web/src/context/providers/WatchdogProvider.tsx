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

export interface FailedWatchdog {
    script_path: string;
    script_name: string;
    error_message: string;
    timestamp: string;
}

interface WatchdogContextType {
    watchdogs: WatchdogStatus[];
    failedWatchdogs: FailedWatchdog[];
    hasIssues: boolean;
    isWatchdogInitialized: boolean;
}

const WatchdogContext = createContext<WatchdogContextType | undefined>(undefined);

export const WatchdogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [watchdogs, setWatchdogs] = useState<WatchdogStatus[]>([]);
    const [failedWatchdogs, setFailedWatchdogs] = useState<FailedWatchdog[]>([]);
    const [isWatchdogInitialized, setIsWatchdogInitialized] = useState(false);

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await api.get('/api/watchdogs');
                if (res.data) {
                    if (Array.isArray(res.data.watchdogs)) setWatchdogs(res.data.watchdogs);
                    // Handle failed watchdogs if present
                    if (Array.isArray(res.data.failed_watchdogs)) {
                        setFailedWatchdogs(res.data.failed_watchdogs);
                    } else {
                        setFailedWatchdogs([]);
                    }
                }
            } catch (err) {
                // Silently fail status polling
            } finally {
                setIsWatchdogInitialized(true); // Mark as initialized after the first fetch
            }
        };

        fetchStatus(); // Initial fetch
        const interval = setInterval(fetchStatus, 3000); // Poll every 3 seconds
        return () => clearInterval(interval);
    }, []);

    const hasIssues = watchdogs.some(w => w.status === 'warning' || w.status === 'error') || failedWatchdogs.length > 0;

    return (
        <WatchdogContext.Provider value={{ watchdogs, failedWatchdogs, hasIssues, isWatchdogInitialized }}>
            {children}
        </WatchdogContext.Provider>
    );
};

export const useWatchdog = () => {
    const context = useContext(WatchdogContext);
    if (!context) throw new Error("useWatchdog must be used within a WatchdogProvider");
    return context;
};
