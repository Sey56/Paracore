import { NotificationProvider } from './providers/NotificationProvider';
import { UserProvider } from '@/features/auth/store/UserProvider';
import { RevitProvider } from './providers/RevitProvider';
import { ScriptProvider } from '@/features/automation/store/ScriptProvider';
import { ScriptExecutionProvider } from '@/features/automation/store/ScriptExecutionProvider';
import { UIProvider } from './providers/UIProvider';
import { AuthProvider } from '@/features/auth/store/AuthProvider';
import { WorkspaceProvider } from '@/features/workspaces/store/WorkspaceProvider';
import { PlaylistProvider } from '@/features/automation/store/PlaylistProvider';

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <NotificationProvider>
      <AuthProvider>
        <UserProvider>
          <WorkspaceProvider>
            <RevitProvider>
              <UIProvider>
                <ScriptProvider>
                  <ScriptExecutionProvider>
                    <PlaylistProvider>
                      {children}
                    </PlaylistProvider>
                  </ScriptExecutionProvider>
                </ScriptProvider>
              </UIProvider>
            </RevitProvider>
          </WorkspaceProvider>
        </UserProvider>
      </AuthProvider>
    </NotificationProvider>
  );
};
