import { NotificationProvider } from './providers/NotificationProvider';
import { RevitProvider } from './providers/RevitProvider';
import { ScriptProvider } from '@/features/automation/store/ScriptProvider';
import { ScriptExecutionProvider } from '@/features/automation/store/ScriptExecutionProvider';
import { AuthProvider } from '@/features/auth/store/AuthProvider';
import { PlaylistProvider } from '@/features/automation/store/PlaylistProvider';
import { WatchdogProvider } from '@/context/providers/WatchdogProvider';
import { ConsoleProviderWrapper } from '@/features/automation/store/ConsoleProviderWrapper';

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <NotificationProvider>
      <AuthProvider>
            <RevitProvider>
              <WatchdogProvider>
                <ScriptProvider>
                  <ScriptExecutionProvider>
                    <ConsoleProviderWrapper>
                      <PlaylistProvider>
                        {children}
                      </PlaylistProvider>
                    </ConsoleProviderWrapper>
                  </ScriptExecutionProvider>
                </ScriptProvider>
              </WatchdogProvider>
            </RevitProvider>
      </AuthProvider>
    </NotificationProvider>
  );
};
