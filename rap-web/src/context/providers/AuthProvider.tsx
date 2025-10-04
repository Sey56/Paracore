import React, { useState, useEffect, ReactNode, useCallback } from 'react';
import { GoogleOAuthProvider, CredentialResponse, TokenResponse, CodeResponse } from '@react-oauth/google';
import axios from 'axios';
import { AuthContext, User } from '../authTypes';

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

  const logout = useCallback(() => {
    localStorage.removeItem('rap_cloud_token');
    localStorage.removeItem('rap_local_token');
    localStorage.removeItem('rap_user');
    setCloudToken(null);
    setLocalToken(null);
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  useEffect(() => {
    const storedCloudToken = localStorage.getItem('rap_cloud_token');
    const storedUser = localStorage.getItem('rap_user');

    if (storedCloudToken && storedUser) {
      try {
        const parsedUser: User = JSON.parse(storedUser);
        setCloudToken(storedCloudToken);
        setUser(parsedUser);
        setIsAuthenticated(true);
      } catch (error) {
        console.error('Failed to parse stored user data:', error);
        logout();
      }
    }
  }, [logout]);

  const login = async (credentialResponse: CredentialResponse) => {
    console.log('AuthProvider: login function called with credentialResponse:', credentialResponse);
    try {
      if (credentialResponse.credential) {
        const cloudAuthResponse = await axios.post('https://rap-auth-server-production.up.railway.app/auth/verify-google-token', { token: credentialResponse.credential });
        const { token: newCloudToken, user: cloudUserData }: { token: string; user: CloudUserResponse } = cloudAuthResponse.data;

        if (!newCloudToken || !cloudUserData) {
          throw new Error('Cloud authentication failed: No token or user data returned.');
        }

        const appUser: User = {
          id: String(cloudUserData.id),
          email: cloudUserData.email,
          name: cloudUserData.name,
          picture_url: cloudUserData.picture_url,
        };

        localStorage.setItem('rap_cloud_token', newCloudToken);
        localStorage.setItem('rap_user', JSON.stringify(appUser));

        setCloudToken(newCloudToken);
        setUser(appUser);
        setIsAuthenticated(true);

        console.log('Login successful. User:', appUser);

      } else {
        throw new Error("Credential not found in response.");
      }

    } catch (error) {
      console.error('Authentication failed:', error);
      logout();
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, cloudToken, localToken, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => (
  <GoogleOAuthProvider clientId="30349329425-qtk3stin2ta0583f16t31s7ig9004q0u.apps.googleusercontent.com">
    <InnerAuthProvider>{children}</InnerAuthProvider>
  </GoogleOAuthProvider>
);