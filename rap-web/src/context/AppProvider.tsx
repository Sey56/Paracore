import { NotificationProvider } from './providers/NotificationProvider';
import { UserProvider } from '@/features/auth/store/UserProvider';
import { RevitProvider } from './providers/RevitProvider';
import { ScriptProvider } from '@/features/automation/store/ScriptProvider';
import { ScriptExecutionProvider } from '@/features/automation/store/ScriptExecutionProvider';
import { UIProvider } from './providers/UIProvider';
import { AuthProvider } from '@/features/auth/store/AuthProvider';
import { TeamSourceProvider } from '@/features/team-sources/store/TeamSourceProvider';
import { PlaylistProvider } from '@/features/automation/store/PlaylistProvider';

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <NotificationProvider>
      <AuthProvider>
        <UserProvider>
          <TeamSourceProvider>
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
          </TeamSourceProvider>
        </UserProvider>
      </AuthProvider>
    </NotificationProvider>
  );
};
