import { NotificationProvider } from './providers/NotificationProvider';
import { UserProvider } from './providers/UserProvider';
import { RevitProvider } from './providers/RevitProvider';
import { ScriptProvider } from './providers/ScriptProvider';
import { ScriptExecutionProvider } from './providers/ScriptExecutionProvider';
import { UIProvider } from './providers/UIProvider';
import { AuthProvider } from './providers/AuthProvider';
import { WorkspaceProvider } from './providers/WorkspaceProvider';
import { PlaylistProvider } from './providers/PlaylistProvider';

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
