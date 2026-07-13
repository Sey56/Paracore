import { useState, useEffect, useCallback, useRef } from 'react';
import { Message, TokenUsage } from '../types/agentTypes';
import {
  AgentSession, ACTIVE_SESSION_KEY,
  loadSessions, saveSessions,
  loadSessionMessages, saveSessionMessages,
  loadSessionThreadId, saveSessionThreadId,
  loadSessionUsage, saveSessionUsage, clearSessionData,
} from '../utils/sessionStorage';

export interface SessionManager {
  sessions: AgentSession[];
  activeSessionId: string;
  activeSession: AgentSession | undefined;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  threadId: string | null;
  setThreadId: React.Dispatch<React.SetStateAction<string | null>>;
  cumulativeUsage: TokenUsage;
  setCumulativeUsage: React.Dispatch<React.SetStateAction<TokenUsage>>;
  handleNewSession: () => void;
  handleSwitchSession: (sessionId: string) => void;
  handleDeleteSession: (sessionId: string) => void;
}

export function useSessionManager(): SessionManager {
  const [sessions, setSessions] = useState<AgentSession[]>(() => {
    const existing = loadSessions();
    if (existing.length > 0) return existing;
    const id = crypto.randomUUID();
    const session: AgentSession = { id, name: 'New Chat', threadId: null, messageCount: 0, updatedAt: Date.now() };
    const list = [session];
    saveSessions(list);
    localStorage.setItem(ACTIVE_SESSION_KEY, id);
    return list;
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    return localStorage.getItem(ACTIVE_SESSION_KEY) || sessions[0]?.id || crypto.randomUUID();
  });

  const [messages, setMessages] = useState<Message[]>(() => loadSessionMessages(activeSessionId));
  const [threadId, setThreadId] = useState<string | null>(() => loadSessionThreadId(activeSessionId));
  const [cumulativeUsage, setCumulativeUsage] = useState<TokenUsage>(() => loadSessionUsage(activeSessionId));

  // Persist messages
  useEffect(() => {
    saveSessionMessages(activeSessionId, messages);
    setSessions(prev => {
      const updated = prev.map(s => s.id === activeSessionId ? { ...s, messageCount: messages.length, updatedAt: Date.now() } : s);
      saveSessions(updated);
      return updated;
    });
  }, [messages, activeSessionId]);

  // Persist threadId
  useEffect(() => {
    saveSessionThreadId(activeSessionId, threadId);
  }, [threadId, activeSessionId]);

  // Persist usage
  useEffect(() => {
    saveSessionUsage(activeSessionId, cumulativeUsage);
  }, [cumulativeUsage, activeSessionId]);

  const hasHumanMessages = useCallback((msgs: Message[]) => {
    return msgs.some(m => m.type === 'human' && !m.content?.toString().startsWith('System:'));
  }, []);

  const handleNewSession = useCallback(() => {
    if (!hasHumanMessages(messages) && threadId === null) return;
    saveSessionMessages(activeSessionId, messages);
    saveSessionThreadId(activeSessionId, threadId);
    const now = Date.now();
    const updatedSessions = sessions.map(s =>
      s.id === activeSessionId ? { ...s, messageCount: messages.length, threadId, updatedAt: now } : s
    );
    const newId = crypto.randomUUID();
    const newSession: AgentSession = { id: newId, name: 'New Chat', threadId: null, messageCount: 0, updatedAt: now };
    const list = [...updatedSessions, newSession].sort((a, b) => b.updatedAt - a.updatedAt);
    saveSessions(list);
    localStorage.setItem(ACTIVE_SESSION_KEY, newId);
    setSessions(list);
    setActiveSessionId(newId);
    setMessages([]);
    setThreadId(null);
    setCumulativeUsage({ input_tokens: 0, output_tokens: 0, total_tokens: 0, requests: 0 });
    saveSessionUsage(newId, { input_tokens: 0, output_tokens: 0, total_tokens: 0, requests: 0 });
  }, [activeSessionId, messages, threadId, sessions, hasHumanMessages]);

  const handleSwitchSession = useCallback((sessionId: string) => {
    if (sessionId === activeSessionId) return;
    saveSessionMessages(activeSessionId, messages);
    saveSessionThreadId(activeSessionId, threadId);
    const now = Date.now();
    const updatedSessions = sessions.map(s =>
      s.id === activeSessionId ? { ...s, messageCount: messages.length, threadId, updatedAt: now } : s
    );
    saveSessions(updatedSessions);
    setSessions(updatedSessions);
    localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
    setActiveSessionId(sessionId);
    setMessages(loadSessionMessages(sessionId));
    setThreadId(loadSessionThreadId(sessionId));
    setCumulativeUsage(loadSessionUsage(sessionId));
  }, [activeSessionId, messages, threadId, sessions]);

  const handleDeleteSession = useCallback((sessionId: string) => {
    setSessions(prev => {
      const remaining = prev.filter(s => s.id !== sessionId);
      if (remaining.length === 0) {
        clearSessionData(sessionId);
        const cleared: AgentSession = { ...prev.find(s => s.id === sessionId)!, name: 'New Chat', threadId: null, messageCount: 0, updatedAt: Date.now() };
        saveSessions([cleared]);
        setMessages([]);
        setThreadId(null);
        setCumulativeUsage({ input_tokens: 0, output_tokens: 0, total_tokens: 0, requests: 0 });
        return [cleared];
      }
      saveSessionMessages(activeSessionId, messages);
      saveSessionThreadId(activeSessionId, threadId);
      clearSessionData(sessionId);
      saveSessions(remaining);
      if (sessionId === activeSessionId) {
        const sorted = [...remaining].sort((a, b) => b.updatedAt - a.updatedAt);
        const next = sorted[0];
        localStorage.setItem(ACTIVE_SESSION_KEY, next.id);
        setActiveSessionId(next.id);
        setMessages(loadSessionMessages(next.id));
        setThreadId(loadSessionThreadId(next.id));
        setCumulativeUsage(loadSessionUsage(next.id));
      }
      return remaining;
    });
  }, [activeSessionId, messages, threadId]);

  // Auto-name session from first human message
  const didAutoNameRef = useRef(false);
  useEffect(() => {
    if (didAutoNameRef.current) return;
    const firstHuman = messages.find(m => m.type === 'human' && !m.content?.toString().startsWith('System:'));
    if (firstHuman) {
      const name = String(firstHuman.content).slice(0, 40) + (String(firstHuman.content).length > 40 ? '…' : '');
      setSessions(prev => {
        const updated = prev.map(s => s.id === activeSessionId && s.name === 'New Chat' ? { ...s, name } : s);
        saveSessions(updated);
        return updated;
      });
      didAutoNameRef.current = true;
    }
  }, [messages, activeSessionId]);

  // Reset auto-name when switching sessions
  useEffect(() => {
    didAutoNameRef.current = false;
  }, [activeSessionId]);

  const activeSession = sessions.find(s => s.id === activeSessionId);

  return {
    sessions, activeSessionId, activeSession,
    messages, setMessages,
    threadId, setThreadId,
    cumulativeUsage, setCumulativeUsage,
    handleNewSession, handleSwitchSession, handleDeleteSession,
  };
}
