import React, { useState, useEffect, ReactNode, useCallback } from 'react';
import axios from 'axios';
import { AuthContext, User, TeamMembership, Role } from '../authTypes';
import { invoke } from '@tauri-apps/api';
import { syncUserProfile, UserProfileSyncPayload } from '@/api/workspaces'; // Import syncUserProfile and its payload
import { TeamSelectionModal } from '@/components/common/TeamSelectionModal'; // Import TeamSelectionModal

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
  const [showTeamSelectionModal, setShowTeamSelectionModal] = useState<boolean>(false);
  const [pendingUser, setPendingUser] = useState<User | null>(null); // To hold user data before team selection

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
    setShowTeamSelectionModal(false); // Reset modal state on logout
    setPendingUser(null); // Reset pending user on logout
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

        // Handle active team selection from storage
        let teamToActivate: TeamMembership | null = null;
        if (storedActiveTeam) {
          const parsedActiveTeam: TeamMembership = JSON.parse(storedActiveTeam);
          // Ensure the stored active team is still valid for the user
          if (parsedUser.memberships.some(m => m.team_id === parsedActiveTeam.team_id)) {
            teamToActivate = parsedActiveTeam;
          }
        }

        if (teamToActivate) {
          setActiveTeamState(teamToActivate);
          setActiveRole(teamToActivate.role);
        } else if (parsedUser.memberships.length > 0) {
          // If no valid stored team, and user has memberships, prompt for selection or default
          if (parsedUser.memberships.length > 1) {
            setPendingUser(parsedUser);
            setShowTeamSelectionModal(true);
          } else {
            // Only one team, set it automatically
            const initialTeam = parsedUser.memberships[0];
            localStorage.setItem('rap_active_team', JSON.stringify(initialTeam));
            setActiveTeamState(initialTeam);
            setActiveRole(initialTeam.role);
          }
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

  const handleTeamSelected = useCallback(async (team: TeamMembership) => {
    if (!pendingUser) return;

    localStorage.setItem('rap_active_team', JSON.stringify(team));
    setActiveTeamState(team);
    setActiveRole(team.role);
    setShowTeamSelectionModal(false);

    // Sync user profile to local rap-server after team selection
    if (pendingUser.id && pendingUser.email) {
      const profilePayload: UserProfileSyncPayload = {
        user_id: Number(pendingUser.id),
        email: pendingUser.email,
        memberships: pendingUser.memberships,
        activeTeam: team.team_id,
        activeRole: team.role,
      };
      try {
        await syncUserProfile(profilePayload);
        console.log("User profile synced to local rap-server after team selection.");
      } catch (syncError) {
        console.error("Failed to sync user profile to local rap-server:", syncError);
      }
    }
    setPendingUser(null); // Clear pending user
  }, [pendingUser]);


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

      // --- RESTRICTION: EMAIL ALLOWLIST ---
      const ALLOWED_EMAILS = [
        "seyoumhgs@gmail.com",
        "seyash98@gmail.com",
        "codarch46@gmail.com",
        "assash98@gmail.com"
      ];

      if (appUser.email && !ALLOWED_EMAILS.includes(appUser.email)) {
        alert("Access Restricted: This version of Paracore is currently in Private Beta.\n\nPlease use the 'Continue Offline' option to use the Free Personal Edition.");
        logout();
        return;
      }
      // ------------------------------------

      const now = new Date().getTime();
      localStorage.setItem('rap_cloud_token', newCloudToken);
      localStorage.setItem('rap_user', JSON.stringify(appUser));
      localStorage.setItem('rap_session_start_time', String(now));

      setCloudToken(newCloudToken);
      setUser(appUser);
      setIsAuthenticated(true);
      setSessionStartTime(now);

      if (appUser.memberships.length > 1) {
        setPendingUser(appUser);
        setShowTeamSelectionModal(true);
      } else if (appUser.memberships.length === 1) {
        const initialTeam = appUser.memberships[0];
        localStorage.setItem('rap_active_team', JSON.stringify(initialTeam));
        setActiveTeamState(initialTeam);
        setActiveRole(initialTeam.role);

        // Sync user profile to local rap-server immediately if only one team
        if (appUser.id && appUser.email) {
          const profilePayload: UserProfileSyncPayload = {
            user_id: Number(appUser.id),
            email: appUser.email,
            memberships: appUser.memberships,
            activeTeam: initialTeam.team_id,
            activeRole: initialTeam.role,
          };
          try {
            await syncUserProfile(profilePayload);
            console.log("User profile synced to local rap-server.");
          } catch (syncError) {
            console.error("Failed to sync user profile to local rap-server:", syncError);
          }
        }
      } else {
        // No memberships, handle as an error or specific state
        console.warn("User has no team memberships.");
        // Optionally, log out or show an error message
        logout();
      }

    } catch (error) {
      console.error('Authentication failed:', error);
      logout();
    }
  };

  const loginLocal = async () => {
    console.log("Starting Local Login...");
    const localToken = "rap-local-token"; // Special token recognized by backend for bypass

    const localUser: User = {
      id: "0", // Changed to "0" to match owner_id: 0 for Number() conversion in Sidebar
      email: "local@paracore.app",
      name: "Local User",
      picture_url: undefined, // Or a local asset placeholder
      memberships: [
        {
          team_id: 0,
          team_name: "Local Team",
          role: Role.Admin, // Full permissions locally
          owner_id: 0,
        }
      ]
    };

    const now = new Date().getTime();
    localStorage.setItem('rap_cloud_token', localToken); // Store as cloud token for seamless API compat
    localStorage.setItem('rap_user', JSON.stringify(localUser));
    localStorage.setItem('rap_session_start_time', String(now));

    setCloudToken(localToken);
    setUser(localUser);
    setIsAuthenticated(true);
    setSessionStartTime(now);

    // Auto-set the "Local Team"
    const initialTeam = localUser.memberships[0];
    localStorage.setItem('rap_active_team', JSON.stringify(initialTeam));
    setActiveTeamState(initialTeam);
    setActiveRole(initialTeam.role);

    // Sync user profile to local rap-server immediately
    // Note: Backend handles creation of this user on the fly if needed
    const profilePayload: UserProfileSyncPayload = {
      user_id: 0, // Matches the backend's dummy ID logic if possible, or just used for profile sync
      email: localUser.email,
      memberships: localUser.memberships,
      activeTeam: initialTeam.team_id,
      activeRole: initialTeam.role,
    };
    try {
      // We use '0' as ID for sync; backend auth layer resolves "rap-local-token" to proper DB ID
      // But here we might be sending a payload that expects an ID. 
      // Sync endpoint uses `req.user_id`. Let's pass 0, assuming backend handles the profile or we just rely on the token auth to create the User row first.
      // Actually, `sync_user_profile` endpoint logic might need to ensure the user exists first.
      // But since `loginLocal` sets the token, subsequent requests (including this sync) use that token.
      // The backend's `get_current_user` creates the user if missing.
      // So this sync call is safe.
      await syncUserProfile(profilePayload);
      console.log("Local User profile synced.");
    } catch (syncError) {
      console.error("Failed to sync local user profile to local rap-server:", syncError);
    }
  };

  const handleTeamSelectionCancel = useCallback(() => {
    setShowTeamSelectionModal(false);
    setPendingUser(null);
    // Optionally, you might want to log out the user here if canceling team selection means they can't proceed.
    // For now, we'll just close the modal and clear pending user.
  }, []);

  const memoizedUser = React.useMemo(() => user, [user]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user: memoizedUser, cloudToken, localToken, login, loginLocal, logout, sessionStartTime, activeTeam, activeRole }}>
      {children}
      {pendingUser && (
        <TeamSelectionModal
          isOpen={showTeamSelectionModal}
          memberships={pendingUser.memberships}
          onSelectTeam={handleTeamSelected}
          onCancel={handleTeamSelectionCancel}
        />
      )}
    </AuthContext.Provider>
  );
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => (
  <InnerAuthProvider>{children}</InnerAuthProvider>
);
