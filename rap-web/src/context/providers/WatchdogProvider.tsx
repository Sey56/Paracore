import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import api from '@/api/axios';
import { useAuth } from '@/features/auth';
import { useNotifications } from '@/hooks/useNotifications';

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
    // Configuration State (The Sovereign Truth)
    configuredWatchdogRoots: string[];
    watchdogSources: string[];
    
    // UI/Execution State
    watchdogs: WatchdogStatus[];
    failedWatchdogs: FailedWatchdog[];
    isArmingWatchdogs: boolean;
    isWatchdogInitialized: boolean;
    hasIssues: boolean;

    // Actions
    addConfiguredWatchdogRoot: (path: string) => void;
    removeConfiguredWatchdogRoot: (path: string) => void;
    toggleScriptArm: (scriptPath: string) => Promise<void>;
    armAllInList: (scripts: string[]) => Promise<void>;
    decommissionAll: () => Promise<void>;
}

const WatchdogContext = createContext<WatchdogContextType | undefined>(undefined);

export const WatchdogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, isAuthenticated } = useAuth();
    const { showNotification } = useNotifications();
    const userId = user?.id || 'anon';

    // 1. Sovereign Configuration State (Loaded from Disk)
    const [configuredWatchdogRoots, setConfiguredWatchdogRoots] = useState<string[]>([]);
    const [watchdogSources, setWatchdogSources] = useState<string[]>([]);
    
    // 2. Runtime Status State (Polled from Backend)
    const [watchdogs, setWatchdogs] = useState<WatchdogStatus[]>([]);
    const [failedWatchdogs, setFailedWatchdogs] = useState<FailedWatchdog[]>([]);
    
    // 3. UI States
    const [isArmingWatchdogs, setIsArmingWatchdogs] = useState(false);
    const [isWatchdogInitialized, setIsWatchdogInitialized] = useState(false);
    const [isConfigLoaded, setIsConfigLoaded] = useState(false);

    const armingSessionStartedRef = useRef<string | null>(null);
    const normalize = (p: string) => (p || "").replace(/\\/g, '/').toLowerCase().trim();

    // PHASE 1: Load config from Disk
    useEffect(() => {
        setIsConfigLoaded(false);
        const load = (key: string) => {
            const userKey = `${key}_${userId}`;
            const stored = localStorage.getItem(userKey) || localStorage.getItem(key);
            try { return stored ? JSON.parse(stored).map(normalize) : []; } catch { return []; }
        };

        setConfiguredWatchdogRoots(load('rap_configuredWatchdogRoots'));
        setWatchdogSources(load('rap_watchdogSources'));
        setIsConfigLoaded(true);
    }, [userId]);

    // PHASE 2: Save config to Disk
    useEffect(() => {
        if (!isConfigLoaded) return;
        localStorage.setItem(`rap_configuredWatchdogRoots_${userId}`, JSON.stringify(configuredWatchdogRoots));
        localStorage.setItem(`rap_watchdogSources_${userId}`, JSON.stringify(watchdogSources));
    }, [configuredWatchdogRoots, watchdogSources, userId, isConfigLoaded]);

    // PHASE 3: Linear Arming Sequence (Memory -> Backend)
    useEffect(() => {
        if (!isConfigLoaded || !isAuthenticated) return;

        const sessionId = `${userId}_arm_v1`; // Unique per-app-load arming
        if (armingSessionStartedRef.current === sessionId) return;
        armingSessionStartedRef.current = sessionId;

        const armOnStartup = async () => {
            if (watchdogSources.length === 0) return;

            console.log("[WatchdogProvider] 🛡️ Re-arming standby sentinels:", watchdogSources);
            setIsArmingWatchdogs(true);
            
            // Sequential registration to protect Revit gRPC
            for (const path of watchdogSources) {
                try { await api.post("/api/watchdogs/register-source", { path }); } catch (e) {}
                await new Promise(r => setTimeout(r, 200));
            }

            // Close gate after 1.5s minimum
            setTimeout(() => setIsArmingWatchdogs(false), 1500);
        };

        armOnStartup();
    }, [isConfigLoaded, isAuthenticated, userId]);

    // PHASE 4: Status Heartbeat (Backend -> Memory UI only)
    useEffect(() => {
        const fetchStatus = async () => {
            if (!isAuthenticated) return;
            try {
                const res = await api.get('/api/watchdogs');
                if (res.data) {
                    setWatchdogs(Array.isArray(res.data.watchdogs) ? res.data.watchdogs : []);
                    setFailedWatchdogs(Array.isArray(res.data.failed_watchdogs) ? res.data.failed_watchdogs : []);
                }
            } catch (err) { } 
            finally { setIsWatchdogInitialized(true); }
        };

        fetchStatus();
        const interval = setInterval(fetchStatus, 3000);
        return () => clearInterval(interval);
    }, [isAuthenticated]);

    // ACTIONS
    const addConfiguredWatchdogRoot = useCallback((path: string) => {
        setConfiguredWatchdogRoots(prev => Array.from(new Set([...prev, normalize(path)])));
    }, []);

    const removeConfiguredWatchdogRoot = useCallback((path: string) => {
        const normPath = normalize(path);
        setConfiguredWatchdogRoots(prev => prev.filter(p => p !== normPath));
        // We do NOT remove watchdogSources here - the user must manually disarm or use Decommission
    }, []);

    const toggleScriptArm = async (scriptPath: string) => {
        const path = normalize(scriptPath);
        const isArmed = watchdogSources.some(s => normalize(s) === path);

        if (isArmed) {
            setWatchdogSources(prev => prev.filter(s => normalize(s) !== path));
            try { await api.post("/api/watchdogs/unregister-source", { path }); } catch (e) {}
        } else {
            setWatchdogSources(prev => Array.from(new Set([...prev, path])));
            try { await api.post("/api/watchdogs/register-source", { path }); } catch (e) {}
        }
    };

    const armAllInList = async (scripts: string[]) => {
        showNotification(`Activating ${scripts.length} Sentinels...`, "info");
        for (const s of scripts) {
            const path = normalize(s);
            if (!watchdogSources.includes(path)) {
                setWatchdogSources(prev => Array.from(new Set([...prev, path])));
                try { await api.post("/api/watchdogs/register-source", { path }); } catch (e) {}
                await new Promise(r => setTimeout(r, 300));
            }
        }
        showNotification("Sentinel activation sequence complete.", "success");
    };

    const decommissionAll = async () => {
        showNotification("Decommissioning background systems...", "info");
        // Kill everything on backend
        const all = [...watchdogs, ...failedWatchdogs];
        for (const w of all) {
            try { await api.post("/api/watchdogs/unregister-source", { path: normalize(w.script_path) }); } catch (e) {}
        }
        // Clear frontend
        setWatchdogSources([]);
        showNotification("All Sentinels decommissioned.", "success");
    };

    const hasIssues = watchdogs.some(w => w.status === 'warning' || w.status === 'error') || failedWatchdogs.length > 0;

    return (
        <WatchdogContext.Provider value={{ 
            configuredWatchdogRoots, watchdogSources, watchdogs, failedWatchdogs, 
            isArmingWatchdogs, isWatchdogInitialized, hasIssues,
            addConfiguredWatchdogRoot, removeConfiguredWatchdogRoot, toggleScriptArm, armAllInList, decommissionAll
        }}>
            {children}
        </WatchdogContext.Provider>
    );
};

export const useWatchdog = () => {
    const context = useContext(WatchdogContext);
    if (!context) throw new Error("useWatchdog must be used within a WatchdogProvider");
    return context;
};
