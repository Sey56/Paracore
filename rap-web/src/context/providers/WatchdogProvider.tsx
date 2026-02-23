import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import api from '@/api/axios';
import { useAuth } from '@/features/auth';
import { useNotifications } from '@/hooks/useNotifications';
import useLocalStorage from '@/hooks/useLocalStorage';

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
    executeSentinelAction: (scriptPath: string, mode: 'Select' | 'Isolate') => Promise<void>;
}

const WatchdogContext = createContext<WatchdogContextType | undefined>(undefined);

export const WatchdogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, isAuthenticated } = useAuth();
    const { showNotification } = useNotifications();
    const stableUserId = user?.id || 'anon';

    const normalize = (p: string) => (p || "").replace(/\\/g, '/').toLowerCase().trim();

    // 1. Sovereign Configuration State (Managed by fixed useLocalStorage)
    const [configuredWatchdogRoots, setConfiguredWatchdogRoots] = useLocalStorage<string[]>(`rap_configuredWatchdogRoots_${stableUserId}`, []);
    const [watchdogSources, setWatchdogSources] = useLocalStorage<string[]>(`rap_watchdogSources_${stableUserId}`, []);

    // 2. Runtime Status State (Polled from Backend)
    const [watchdogs, setWatchdogs] = useState<WatchdogStatus[]>([]);
    const [failedWatchdogs, setFailedWatchdogs] = useState<FailedWatchdog[]>([]);

    // 3. UI States
    // ZERO-LATENCY GATE INITIALIZER:
    const [isArmingWatchdogs, setIsArmingWatchdogs] = useState(() => {
        try {
            const storedUser = localStorage.getItem('rap_user');
            if (!storedUser) return false;
            const uid = JSON.parse(storedUser).id || '0';
            const sources = localStorage.getItem(`rap_watchdogSources_${uid}`);
            return sources ? JSON.parse(sources).length > 0 : false;
        } catch { return false; }
    });

    const [isWatchdogInitialized, setIsWatchdogInitialized] = useState(false);
    const armingInitiatedRef = useRef<string | null>(null);
    const gateStartTimeRef = useRef<number>(Date.now());

    // PHASE 1: Linear Arming Sequence (Memory -> Backend)
    useEffect(() => {
        if (!isAuthenticated) {
            // Don't kill the gate here — auth may still be loading.
            // The gate will close naturally once auth resolves and the arming path runs.
            // Safety: if auth never resolves, close the gate after 4s.
            const safetyTimer = setTimeout(() => setIsArmingWatchdogs(false), 4000);
            return () => clearTimeout(safetyTimer);
        }

        const sessionId = `${stableUserId}_${gateStartTimeRef.current}`;
        if (armingInitiatedRef.current === sessionId) return;
        armingInitiatedRef.current = sessionId;

        const armOnStartup = async () => {
            if (watchdogSources.length === 0) {
                setIsArmingWatchdogs(false);
                return;
            }

            console.log("[WatchdogProvider] 🛡️ Re-arming standby sentinels:", watchdogSources);
            setIsArmingWatchdogs(true);

            // Stabilization delay
            await new Promise(r => setTimeout(r, 1200));

            for (const path of watchdogSources) {
                try { await api.post("/api/watchdogs/register-source", { path: normalize(path) }); } catch (e) { }
                await new Promise(r => setTimeout(r, 200));
            }

            // Ensure gate stays for at least 2.5s total (entrance effect)
            const elapsed = Date.now() - gateStartTimeRef.current;
            const remaining = Math.max(0, 2500 - elapsed);
            setTimeout(() => setIsArmingWatchdogs(false), remaining);
        };

        armOnStartup();
    }, [isAuthenticated, stableUserId]);

    // PHASE 2: Status Heartbeat (Backend -> Memory UI only)
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
        const norm = normalize(path);
        // Deduplicate case-insensitively but store the original casing
        setConfiguredWatchdogRoots(prev => {
            const exists = prev.some(p => normalize(p) === norm);
            if (exists) return prev;
            return [...prev, path];
        });
    }, [setConfiguredWatchdogRoots]);

    const removeConfiguredWatchdogRoot = useCallback((path: string) => {
        const norm = normalize(path);
        setConfiguredWatchdogRoots(prev => prev.filter(p => normalize(p) !== norm));
    }, [setConfiguredWatchdogRoots]);

    const toggleScriptArm = async (scriptPath: string) => {
        const path = normalize(scriptPath);
        const isArmed = watchdogSources.some(s => normalize(s) === path);

        if (isArmed) {
            setWatchdogSources(prev => prev.filter(s => normalize(s) !== path));
            try { await api.post("/api/watchdogs/unregister-source", { path }); } catch (e) { }
        } else {
            setWatchdogSources(prev => Array.from(new Set([...prev, path])));
            try { await api.post("/api/watchdogs/register-source", { path }); } catch (e) { }
        }
    };

    const armAllInList = async (scripts: string[]) => {
        showNotification(`Deploying ${scripts.length} Sentinels...`, "info");

        // Use a local copy to calculate what needs arming
        const currentArmed = new Set(watchdogSources.map(normalize));
        const toArm = scripts.map(normalize).filter(p => !currentArmed.has(p));

        if (toArm.length === 0) {
            showNotification("All selected units are already active.", "info");
            return;
        }

        // Add to state immediately for UI feedback
        setWatchdogSources(prev => Array.from(new Set([...prev, ...toArm])));

        for (const path of toArm) {
            try { await api.post("/api/watchdogs/register-source", { path }); } catch (e) { }
            await new Promise(r => setTimeout(r, 300));
        }
        showNotification("Sentinel deployment complete.", "success");
    };

    const decommissionAll = async () => {
        showNotification("Undeploying all sentinels...", "info");
        // Build a complete set of all paths to unregister — from both status reports AND local armed state
        const allPaths = new Set([
            ...watchdogs.map(w => normalize(w.script_path)),
            ...failedWatchdogs.map(f => normalize(f.script_path)),
            ...watchdogSources.map(normalize)
        ]);
        for (const path of allPaths) {
            try { await api.post("/api/watchdogs/unregister-source", { path }); } catch (e) { }
        }
        setWatchdogSources([]);
        showNotification("All Sentinels undeployed.", "success");
    };

    const executeSentinelAction = async (scriptPath: string, mode: 'Select' | 'Isolate') => {
        const path = normalize(scriptPath);
        const watchdog = watchdogs.find(w => normalize(w.script_path) === path);

        // Try to recover original parameters from details_json if we want to preserve them,
        // but for now the critical part is overriding AutomationMode.
        const parameters: Record<string, any> = {
            AutomationMode: mode
        };

        if (watchdog?.details_json) {
            try {
                const details = JSON.parse(watchdog.details_json);
                // If the script was generated by the query builder, it might have its data here.
                // We'd need to extract original param values if they were saved.
                // For now, we assume the C# engine handles default values or the breach was based on current values.
            } catch (e) {
                console.error("Failed to parse watchdog details for action", e);
            }
        }

        showNotification(`${mode}ing elements in Revit...`, "info");
        try {
            const response = await api.post("/run-script", {
                path: scriptPath,
                parameters: parameters
            });
            if (response.data.summary) {
                showNotification(response.data.summary, "success");
            }
        } catch (err) {
            console.error(`Failed to execute sentinel ${mode} action`, err);
            showNotification(`Failed to ${mode} elements.`, "error");
        }
    };

    const hasIssues = watchdogs.some(w => w.status === 'warning' || w.status === 'error') || failedWatchdogs.length > 0;

    return (
        <WatchdogContext.Provider value={{
            configuredWatchdogRoots, watchdogSources, watchdogs, failedWatchdogs,
            isArmingWatchdogs, isWatchdogInitialized, hasIssues,
            addConfiguredWatchdogRoot, removeConfiguredWatchdogRoot, toggleScriptArm, armAllInList, decommissionAll,
            executeSentinelAction
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
