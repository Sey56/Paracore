import { NotificationProvider } from './providers/NotificationProvider';
import { UserProvider } from '@/features/auth/store/UserProvider';
import { RevitProvider } from './providers/RevitProvider';
import { ScriptProvider } from '@/features/automation/store/ScriptProvider';
import { ScriptExecutionProvider } from '@/features/automation/store/ScriptExecutionProvider';
import { UIProvider } from './providers/UIProvider';
import { AuthProvider } from '@/features/auth/store/AuthProvider';
import { TeamSourceProvider } from '@/features/team-sources/store/TeamSourceProvider';
import { PlaylistProvider } from '@/features/automation/store/PlaylistProvider';
import { WatchdogProvider } from '@/context/providers/WatchdogProvider';
import { ConsoleProviderWrapper } from '@/features/automation/store/ConsoleProviderWrapper';

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <NotificationProvider>
      <AuthProvider>
        <UserProvider>
          <TeamSourceProvider>
            <RevitProvider>
              <WatchdogProvider>
                <UIProvider>
                  <ScriptProvider>
                    <ScriptExecutionProvider>
                      <ConsoleProviderWrapper>
                        <PlaylistProvider>
                          {children}
                        </PlaylistProvider>
                      </ConsoleProviderWrapper>
                    </ScriptExecutionProvider>
                  </ScriptProvider>
                </UIProvider>
              </WatchdogProvider>
            </RevitProvider>
          </TeamSourceProvider>
        </UserProvider>
      </AuthProvider>
    </NotificationProvider>
  );
};
