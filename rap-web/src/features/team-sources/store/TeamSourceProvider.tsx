import React, { useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import { useAuth } from '@/features/auth';
import { useNotifications } from '@/hooks/useNotifications';
import { cloneSource as cloneSourceApi, CloneSourcePayload } from '../services/teamSources';
import { TeamSourceContext } from './TeamSourceContext';
import { TeamScriptSource } from '@/types';

const LOCAL_STORAGE_KEY = 'rap-team-sources';

export const TeamSourceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [teamScriptSources, setTeamScriptSources] = useState<TeamScriptSource[]>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error("Failed to parse team sources from localStorage:", error);
      return [];
    }
  });

  const [activeSourceId, setActiveSourceId] = useState<number | null>(() => {
    const storedActiveId = localStorage.getItem('rap-active-source-id');
    const storedSources = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
    if (storedActiveId && storedSources.some((ws: TeamScriptSource) => ws.id === Number(storedActiveId))) {
      return Number(storedActiveId);
    }
    return null;
  });

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(teamScriptSources));
  }, [teamScriptSources]);

  useEffect(() => {
    if (activeSourceId !== null) {
      localStorage.setItem('rap-active-source-id', String(activeSourceId));
    } else {
      localStorage.removeItem('rap-active-source-id');
    }
  }, [activeSourceId]);

  const { showNotification } = useNotifications();
  const { isAuthenticated } = useAuth();

  const cloneAndAddSource = useCallback(async (payload: CloneSourcePayload) => {
    const existing = teamScriptSources.find(ws => ws.repo_url === payload.repo_url);
    if (existing) {
      showNotification("Script source already exists, skipping clone", "info");
      return;
    }

    try {
      showNotification("Cloning script source...", "info");
      const response = await cloneSourceApi(payload);
      const { cloned_path, source_id, message } = response;

      const newSource: TeamScriptSource = {
        id: source_id,
        name: payload.repo_url.split('/').pop()?.replace('.git', '') || 'New Source',
        repo_url: payload.repo_url,
      };

      if (message && message === "Source exists in path, loading it...") {
        showNotification(message, "info");
      } else {
        showNotification("Script source cloned and added successfully!", "success");
      }

      setTeamScriptSources((prev) => {
        const next = [...prev, newSource];
        if (prev.length === 0) {
          setActiveSourceId(newSource.id);
        }
        return next;
      });
    } catch (error) {
      console.error("Failed to clone and add source:", error);
      showNotification("Failed to clone source.", "error");
    }
  }, [teamScriptSources, showNotification]);

  const removeTeamSource = useCallback((id: number) => {
    setTeamScriptSources((prev) => {
      const next = prev.filter((ws) => ws.id !== id);
      if (activeSourceId === id) {
        setActiveSourceId(next.length > 0 ? next[0].id : null);
      }
      return next;
    });
  }, [activeSourceId]);

  const clearActiveSource = useCallback(() => {
    setActiveSourceId(null);
  }, []);

  const activeTeamSource = activeSourceId !== null
    ? teamScriptSources.find(ws => ws.id === activeSourceId) || null
    : null;

  const contextValue = useMemo(() => ({
    teamScriptSources,
    activeTeamSource,
    cloneAndAddSource,
    removeTeamSource,
    setActiveSourceId,
    clearActiveSource,
  }), [
    teamScriptSources,
    activeTeamSource,
    cloneAndAddSource,
    removeTeamSource,
    setActiveSourceId,
    clearActiveSource,
  ]);

  return (
    <TeamSourceContext.Provider value={contextValue}>
      {children}
    </TeamSourceContext.Provider>
  );
};
