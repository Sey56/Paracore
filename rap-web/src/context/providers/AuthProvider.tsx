import React, { useState, useEffect, ReactNode, useCallback } from 'react';
import axios from 'axios';
import { AuthContext, User, TeamMembership, Role } from '../authTypes';
import { invoke } from '@tauri-apps/api/tauri';
import { syncUserProfile, UserProfileSyncPayload } from '@/api/workspaces'; // Import syncUserProfile and its payload

// This interface now matches the full UserOut schema from rap-auth-server
interface CloudUserResponse {
  id: number;
  email: string;
  name?: string;
  picture_url?: string;
  memberships: (TeamMembership & { owner_id: number })[]; // Ensure owner_id is present
}

const InnerAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<User | null>(null);
  const [cloudToken, setCloudToken] = useState<string | null>(null);
  const [localToken, setLocalToken] = useState<string | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [activeTeam, setActiveTeamState] = useState<TeamMembership | null>(null);
  const [activeRole, setActiveRole] = useState<Role | null>(null);

  const logout = useCallback(() => {
    localStorage.removeItem('rap_cloud_token');
    localStorage.removeItem('rap_local_token');
    localStorage.removeItem('rap_user');
    localStorage.removeItem('rap_session_start_time');
    localStorage.removeItem('rap_active_team');
    setCloudToken(null);
    setLocalToken(null);
    setUser(null);
    setIsAuthenticated(false);
    setSessionStartTime(null);
    setActiveTeamState(null);
    setActiveRole(null);
  }, []);

  useEffect(() => {
    const storedCloudToken = localStorage.getItem('rap_cloud_token');
    const storedUser = localStorage.getItem('rap_user');
    const storedSessionStartTime = localStorage.getItem('rap_session_start_time');
    const storedActiveTeam = localStorage.getItem('rap_active_team');

    if (storedCloudToken && storedUser) {
      try {
        const parsedUser: User = JSON.parse(storedUser);
        setCloudToken(storedCloudToken);
        setUser(parsedUser);
        setIsAuthenticated(true);

        // Handle active team selection
        let teamToActivate: TeamMembership | null = null;
        if (storedActiveTeam) {
          const parsedActiveTeam: TeamMembership = JSON.parse(storedActiveTeam);
          // Ensure the stored active team is still valid for the user
          if (parsedUser.memberships.some(m => m.team_id === parsedActiveTeam.team_id)) {
            teamToActivate = parsedActiveTeam;
          }
        }
        // If no valid stored team, default to the first one
        if (!teamToActivate && parsedUser.memberships.length > 0) {
          teamToActivate = parsedUser.memberships[0];
          localStorage.setItem('rap_active_team', JSON.stringify(teamToActivate));
        }

        if (teamToActivate) {
          setActiveTeamState(teamToActivate);
          setActiveRole(teamToActivate.role);
        }

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

  const login = async () => {
    try {
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
        memberships: cloudUserData.memberships.map(m => ({ ...m, owner_id: m.owner_id || 0 })), // Ensure owner_id is always present
      };

      const now = new Date().getTime();
      localStorage.setItem('rap_cloud_token', newCloudToken);
      localStorage.setItem('rap_user', JSON.stringify(appUser));
      localStorage.setItem('rap_session_start_time', String(now));

      setCloudToken(newCloudToken);
      setUser(appUser);
      setIsAuthenticated(true);
      setSessionStartTime(now);

      // On first login, set the active team to the first membership
      let activeTeamToSync: TeamMembership | null = null;
      if (appUser.memberships.length > 0) {
        const initialTeam = appUser.memberships[0];
        localStorage.setItem('rap_active_team', JSON.stringify(initialTeam));
        setActiveTeamState(initialTeam);
        setActiveRole(initialTeam.role);
        activeTeamToSync = initialTeam;
      }

      // --- NEW: Sync user profile to local rap-server ---
      if (appUser.id && appUser.email) {
        const profilePayload: UserProfileSyncPayload = {
          user_id: Number(appUser.id), // Ensure it's a number
          email: appUser.email,
          memberships: appUser.memberships,
          activeTeam: activeTeamToSync ? activeTeamToSync.team_id : null,
          activeRole: activeTeamToSync ? activeTeamToSync.role : null,
        };
        try {
          await syncUserProfile(profilePayload);
          console.log("User profile synced to local rap-server.");
        } catch (syncError) {
          console.error("Failed to sync user profile to local rap-server:", syncError);
          // Decide if this should prevent login or just log the error
          // For now, just log and continue login
        }
      }
      // --- END NEW --- 

    } catch (error) {
      console.error('Authentication failed:', error);
      logout();
    }
  };

  const setActiveTeam = (team: TeamMembership) => {
    if (user && user.memberships.some(m => m.team_id === team.team_id)) {
      localStorage.setItem('rap_active_team', JSON.stringify(team));
      setActiveTeamState(team);
      setActiveRole(team.role);
    } else {
      console.error("Attempted to set an invalid active team.");
    }
  };

  const memoizedUser = React.useMemo(() => user, [user]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user: memoizedUser, cloudToken, localToken, login, logout, sessionStartTime, activeTeam, activeRole, setActiveTeam }}>
      {children}
    </AuthContext.Provider>
  );
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => (
  <InnerAuthProvider>{children}</InnerAuthProvider>
);