import { Message, TokenUsage } from '../types/agentTypes';

export const SESSIONS_KEY = 'paracore_agent_sessions';
export const ACTIVE_SESSION_KEY = 'paracore_agent_active_session';

export interface AgentSession {
  id: string;
  name: string;
  threadId: string | null;
  messageCount: number;
  updatedAt: number;
}

export function loadSessions(): AgentSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveSessions(sessions: AgentSession[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function loadSessionMessages(sessionId: string): Message[] {
  try {
    const raw = localStorage.getItem(`agent_session_${sessionId}_msgs`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveSessionMessages(sessionId: string, msgs: Message[]) {
  localStorage.setItem(`agent_session_${sessionId}_msgs`, JSON.stringify(msgs));
}

export function loadSessionThreadId(sessionId: string): string | null {
  return localStorage.getItem(`agent_session_${sessionId}_thread`) || null;
}

export function saveSessionThreadId(sessionId: string, tid: string | null) {
  if (tid) localStorage.setItem(`agent_session_${sessionId}_thread`, tid);
  else localStorage.removeItem(`agent_session_${sessionId}_thread`);
}

export function loadSessionUsage(sessionId: string): TokenUsage {
  try {
    const raw = localStorage.getItem(`agent_session_${sessionId}_usage`);
    return raw ? JSON.parse(raw) : { input_tokens: 0, output_tokens: 0, total_tokens: 0, requests: 0 };
  } catch { return { input_tokens: 0, output_tokens: 0, total_tokens: 0, requests: 0 }; }
}

export function saveSessionUsage(sessionId: string, usage: TokenUsage) {
  localStorage.setItem(`agent_session_${sessionId}_usage`, JSON.stringify(usage));
}

export function clearSessionData(sessionId: string) {
  localStorage.removeItem(`agent_session_${sessionId}_msgs`);
  localStorage.removeItem(`agent_session_${sessionId}_thread`);
  localStorage.removeItem(`agent_session_${sessionId}_usage`);
}
