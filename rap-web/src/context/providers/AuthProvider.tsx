import React, { useState, useEffect, ReactNode, useCallback } from 'react';
import axios from 'axios';
import { AuthContext, User } from '../authTypes';
import { invoke } from '@tauri-apps/api/tauri';

// This interface is a subset of the UserOut schema from rap-auth-server
interface CloudUserResponse {
  id: number;
  email: string;
  name?: string;
  picture_url?: string;
}

const InnerAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<User | null>(null);
  const [cloudToken, setCloudToken] = useState<string | null>(null);
  const [localToken, setLocalToken] = useState<string | null>(null); // Keep for compatibility, though might be unused
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
    const storedCloudToken = localStorage.getItem('rap_cloud_token');
    const storedUser = localStorage.getItem('rap_user');
    const storedSessionStartTime = localStorage.getItem('rap_session_start_time');

    if (storedCloudToken && storedUser) {
      try {
        const parsedUser: User = JSON.parse(storedUser);
        setCloudToken(storedCloudToken);
        setUser(parsedUser);
        setIsAuthenticated(true);

        if (storedSessionStartTime) {
          setSessionStartTime(Number(storedSessionStartTime));
        } else {
          // For users with existing sessions but no start time, set it to now.
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

  const login = async () => {
    try {
      // Call the Tauri command to initiate the Google OAuth flow
      // This command will open the system browser and return the authorization code and redirect URI
      const [authorizationCode, redirectUri]: [string, string] = await invoke('google_oauth_login');

      if (!authorizationCode) {
        throw new Error('No authorization code received from Tauri.');
      }

      const cloudAuthResponse = await axios.post('https://rap-auth-server-production.up.railway.app/auth/verify-google-code', {
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
      logout();
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, cloudToken, localToken, login, logout, sessionStartTime }}>
      {children}
    </AuthContext.Provider>
  );
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => (
  <InnerAuthProvider>{children}</InnerAuthProvider>
);