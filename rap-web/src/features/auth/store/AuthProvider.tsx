import React, { useState, useEffect, ReactNode, useCallback } from 'react';
import axios from 'axios';
import { User } from '../types/authTypes';
import { AuthContext, AuthContextType } from './AuthContext';
import { invoke } from '@tauri-apps/api';

interface CloudUserResponse {
  id: number;
  email: string;
  name?: string;
  picture_url?: string;
}

const InnerAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<User | null>(null);

  // --- EMERGENCY ERROR LOGGING ---
  useEffect(() => {
    const handleGlobalError = (msg: string | Event, url?: string, line?: number, col?: number, error?: Error) => {
      const errInfo = { msg, url, line, col, error: error?.message, stack: error?.stack, time: new Date().toISOString() };
      const logs = JSON.parse(localStorage.getItem('rap_emergency_logs') || '[]');
      logs.push(errInfo);
      localStorage.setItem('rap_emergency_logs', JSON.stringify(logs.slice(-10)));
      return false;
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      const errInfo = { reason: event.reason?.message || event.reason, stack: event.reason?.stack, isRejection: true, time: new Date().toISOString() };
      const logs = JSON.parse(localStorage.getItem('rap_emergency_logs') || '[]');
      logs.push(errInfo);
      localStorage.setItem('rap_emergency_logs', JSON.stringify(logs.slice(-10)));
    };
    window.onerror = handleGlobalError;
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.onerror = null;
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  const [cloudToken, setCloudToken] = useState<string | null>(null);
  const [localToken, setLocalToken] = useState<string | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);

  const logout = useCallback(() => {
    localStorage.removeItem('rap_cloud_token');
    localStorage.removeItem('rap_local_token');
    localStorage.removeItem('rap_user');
    localStorage.removeItem('rap_session_start_time');
    setCloudToken(null);
    setLocalToken(null);
    setUser(null);
    setIsAuthenticated(false);
    setSessionStartTime(null);
  }, []);

  useEffect(() => {
    const handleAuthExpired = () => {
      console.warn("Auth token expired! Logging out gracefully.");
      logout();
    };

    const handleAuthExpiring = async () => {
      console.warn("Auth token expiring — attempting silent refresh via Google OAuth...");
      try {
        const [authorizationCode, redirectUri]: [string, string] = await invoke('google_oauth_login');
        if (!authorizationCode) {
          throw new Error('No authorization code received from Tauri.');
        }
        const cloudAuthResponse = await axios.post('http://localhost:8000/auth/verify-google-code', {
          code: authorizationCode,
          redirect_uri: redirectUri,
        });
        const { access_token: newCloudToken, user: cloudUserData }: { access_token: string; user: CloudUserResponse } = cloudAuthResponse.data;
        if (!newCloudToken || !cloudUserData) {
          throw new Error('Cloud authentication failed: No token or user data returned.');
        }
        localStorage.setItem('rap_cloud_token', newCloudToken);
        const existingUserStr = localStorage.getItem('rap_user');
        if (!existingUserStr) {
          const appUser: User = {
            id: String(cloudUserData.id),
            email: cloudUserData.email,
            name: cloudUserData.name,
            picture_url: cloudUserData.picture_url,
          };
          localStorage.setItem('rap_user', JSON.stringify(appUser));
        }
        setCloudToken(newCloudToken);
        console.log("Token refreshed successfully.");
        window.dispatchEvent(new Event('paracore-auth-refreshed'));
      } catch (refreshError) {
        console.error("Token refresh failed:", refreshError);
        window.dispatchEvent(new Event('paracore-auth-expired'));
      }
    };

    window.addEventListener('paracore-auth-expired', handleAuthExpired);
    window.addEventListener('paracore-auth-expiring', handleAuthExpiring);
    return () => {
      window.removeEventListener('paracore-auth-expired', handleAuthExpired);
      window.removeEventListener('paracore-auth-expiring', handleAuthExpiring);
    };
  }, [logout]);

  // Restore session from localStorage on mount
  useEffect(() => {
    const storedCloudToken = localStorage.getItem('rap_cloud_token');
    const storedUser = localStorage.getItem('rap_user');
    const storedSessionStartTime = localStorage.getItem('rap_session_start_time');

    if (storedCloudToken && storedUser) {
      try {
        const parsedUser: User = JSON.parse(storedUser);
        console.log("[AuthProvider] Found existing user in storage:", parsedUser.email);
        setCloudToken(storedCloudToken);
        setUser(parsedUser);
        setIsAuthenticated(true);

        if (storedSessionStartTime) {
          setSessionStartTime(Number(storedSessionStartTime));
        } else {
          const now = new Date().getTime();
          localStorage.setItem('rap_session_start_time', String(now));
          setSessionStartTime(now);
        }
      } catch (error) {
        console.error('Failed to parse stored user data:', error);
        logout();
      }
    }
  }, [logout]);

  const login = useCallback(async () => {
    try {
      const [authorizationCode, redirectUri]: [string, string] = await invoke('google_oauth_login');
      if (!authorizationCode) {
        throw new Error('No authorization code received from Tauri.');
      }

      const cloudAuthResponse = await axios.post('http://localhost:8000/auth/verify-google-code', {
        code: authorizationCode,
        redirect_uri: redirectUri,
      });
      const { access_token: newCloudToken, user: cloudUserData }: { access_token: string; user: CloudUserResponse } = cloudAuthResponse.data;

      if (!newCloudToken || !cloudUserData) {
        throw new Error('Cloud authentication failed: No token or user data returned.');
      }

      const appUser: User = {
        id: String(cloudUserData.id),
        email: cloudUserData.email,
        name: cloudUserData.name,
        picture_url: cloudUserData.picture_url,
      };

      const now = new Date().getTime();
      localStorage.setItem('rap_cloud_token', newCloudToken);
      localStorage.setItem('rap_user', JSON.stringify(appUser));
      localStorage.setItem('rap_session_start_time', String(now));

      setCloudToken(newCloudToken);
      setUser(appUser);
      setIsAuthenticated(true);
      setSessionStartTime(now);
    } catch (error) {
      console.error('Authentication failed:', error);
    }
  }, [logout]);

  const loginLocal = useCallback(async () => {
    console.log("Starting Local Login...");
    const localToken = "rap-local-token";

    const localUser: User = {
      id: "0",
      email: "local@paracore.app",
      name: "Local User",
      picture_url: undefined,
    };

    const now = new Date().getTime();
    localStorage.setItem('rap_cloud_token', localToken);
    localStorage.setItem('rap_user', JSON.stringify(localUser));
    localStorage.setItem('rap_session_start_time', String(now));

    setCloudToken(localToken);
    setUser(localUser);
    setIsAuthenticated(true);
    setSessionStartTime(now);
  }, []);

  const memoizedUser = React.useMemo(() => user, [user]);

  const isEnterprise = isAuthenticated && cloudToken !== null && cloudToken !== "rap-local-token";

  const contextValue = React.useMemo(() => ({
    isAuthenticated,
    isEnterprise,
    user: memoizedUser,
    cloudToken,
    localToken,
    login,
    loginLocal,
    logout,
    sessionStartTime,
  }), [
    isAuthenticated,
    isEnterprise,
    memoizedUser,
    cloudToken,
    localToken,
    login,
    loginLocal,
    logout,
    sessionStartTime,
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => (
  <InnerAuthProvider>{children}</InnerAuthProvider>
);
