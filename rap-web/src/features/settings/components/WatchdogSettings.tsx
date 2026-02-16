import { open } from '@tauri-apps/api/dialog';
import { useScripts } from '@/features/automation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolder, faTrash, faShieldHeart } from '@fortawesome/free-solid-svg-icons';
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';

interface WatchdogSettingsProps {
  isAuthenticated: boolean;
}

export const WatchdogSettings: React.FC<WatchdogSettingsProps> = ({ isAuthenticated }) => {
  const {
    configuredWatchdogRoots,
    addConfiguredWatchdogRoot,
    removeConfiguredWatchdogRoot,
    watchdogSources,
    setWatchdogSources
  } = useScripts();
  const { showNotification } = useNotifications();

  const handleAddFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
    });

    if (typeof selected === 'string') {
      addConfiguredWatchdogRoot(selected);
      // Auto-arm
      if (!watchdogSources.includes(selected)) {
        await toggleWatchdog(selected);
      }
    }
  };

  const toggleWatchdog = async (path: string) => {
    const isCurrentlyArmed = watchdogSources.includes(path);

    if (isCurrentlyArmed) {
      setWatchdogSources(prev => prev.filter(p => p !== path));
      try {
        await api.post("/api/watchdogs/unregister-source", { path });
        showNotification("Source disarmed. Background tasks stopped.", "info");
      } catch (err) {
        console.error(err);
        showNotification("Failed to stop background tasks.", "error");
      }
    } else {
      setWatchdogSources(prev => [...prev, path]);
      try {
        const response = await api.post("/api/watchdogs/register-source", { path });
        if (response.data.is_success) {
          const details: string[] = response.data.load_details || [];
          const loaded = details.filter((d: string) => d.startsWith("Loaded:"));
          const skipped = details.filter((d: string) => d.startsWith("Skipped:") || d.startsWith("Error:"));

          if (skipped.length > 0) {
            const detailLines = details.map((d: string) => `• ${d}`).join('\n');
            showNotification(
              `Armed ${response.data.watchdogs_registered} watchdog(s). ${skipped.length} skipped/failed:\n${detailLines}`,
              "warning"
            );
          } else {
            showNotification(`Armed ${response.data.watchdogs_registered} watchdog(s) successfully.`, "success");
          }
        } else {
          showNotification(`Failed to arm source: ${response.data.error_message}`, "error");
        }
      } catch (err) {
        showNotification("Failed to contact server to arm source.", "error");
      }
    }
  };

  const handleRemoveSource = async (path: string) => {
    // 1. Unregister from backend (stop background tasks)
    try {
      await api.post("/api/watchdogs/unregister-source", { path });
    } catch (e) {
      console.error("Failed to unregister during removal", e);
    }

    // 2. Remove from "Armed" list if present
    if (watchdogSources.includes(path)) {
      setWatchdogSources(prev => prev.filter(p => p !== path));
    }

    // 3. Remove from "Configured" list (State/Persistence)
    removeConfiguredWatchdogRoot(path);
    showNotification("Source removed and unassigned.", "info");
  };

  return (
    <fieldset disabled={!isAuthenticated} className="disabled:opacity-50">
      <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Watchdog Settings</h3>

      <div className="space-y-4 mb-8 text-sm">
        <p className="text-gray-600 dark:text-gray-400">
          Designate <strong>Watchdog Sources</strong> to enable autonomous background monitoring. Any script projects found in these folders that utilize the Watchdog API will be armed automatically.
        </p>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleAddFolder}
            className="px-4 py-2 bg-blue-500 text-white text-sm font-semibold rounded-md shadow-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
          >
            Add Watchdog Source
          </button>
        </div>
      </div>

      <div>
        <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 border-b border-gray-100 dark:border-gray-700 pb-2">Active Watchdog Sources</h4>
        <ul className="space-y-3">
          {configuredWatchdogRoots && configuredWatchdogRoots.length > 0 ? (
            configuredWatchdogRoots.map((folder: string, index: number) => {
              const isArmed = watchdogSources.includes(folder);
              return (
                <li key={index} className="flex items-center justify-between bg-white dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700/50 shadow-sm group">
                  <div className="flex items-center min-w-0 mr-4">
                    <FontAwesomeIcon icon={faFolder} className="h-5 w-5 text-amber-500 mr-3 shrink-0" />
                    <span className="text-[13px] font-mono text-gray-700 dark:text-gray-300 truncate">{folder}</span>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => toggleWatchdog(folder)}
                      title={isArmed ? "Armed Watchdog Source" : "Arm as Watchdog Source"}
                      className={`p-2 rounded-lg transition-all flex items-center space-x-2 ${isArmed
                        ? "text-orange-500 bg-orange-50 dark:bg-orange-900/20 ring-1 ring-orange-200 dark:ring-orange-800"
                        : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        }`}
                    >
                      <FontAwesomeIcon icon={faShieldHeart} className={isArmed ? "animate-pulse" : ""} />
                      {isArmed && <span className="text-[10px] font-bold uppercase tracking-widest">Armed</span>}
                    </button>

                    <button
                      onClick={() => handleRemoveSource(folder)}
                      className="p-2 rounded-lg text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors"
                      title="Unload Source"
                    >
                      <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8 bg-gray-50 dark:bg-gray-900/20 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
              No local script sources have been added yet.
            </p>
          )}
        </ul>
      </div>
    </fieldset>
  );
};
