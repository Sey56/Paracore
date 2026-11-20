using System;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Threading;
using CoreScript.Engine.Logging;

namespace Paracore.Addin.App
{
    /// <summary>
    /// Announces that Revit is currently connected to the shared Paracore.Server.
    ///
    /// The sidecar belongs to whichever app is using it, not to the app that launched it.
    /// A lease is a timestamped file, not a process handle: the desktop shell hard-kills its
    /// Python backend on close, so no graceful owner teardown can be relied on. The sidecar
    /// checks these leases and exits only when none is fresh — i.e. the last user has gone.
    /// </summary>
    internal static class SidecarLease
    {
        private static readonly string LeaseDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "paracore-data", "sidecar-owners");
        private static readonly string RevitLeaseFile = Path.Combine(LeaseDirectory, "revit.json");
        private static readonly object Gate = new();
        private static Timer? _timer;

        /// <summary>Called when the ribbon turns ON; keeps the lease fresh while connected.</summary>
        public static void Start()
        {
            lock (Gate)
            {
                Write();
                _timer ??= new Timer(
                    _ => Write(),
                    null,
                    TimeSpan.FromSeconds(5),
                    TimeSpan.FromSeconds(5));
            }
        }

        /// <summary>Called when the ribbon turns OFF or Revit shuts down.</summary>
        public static void Stop()
        {
            lock (Gate)
            {
                _timer?.Dispose();
                _timer = null;
                try
                {
                    if (File.Exists(RevitLeaseFile)) File.Delete(RevitLeaseFile);
                }
                catch (Exception ex)
                {
                    FileLogger.LogError($"[SidecarLease] Could not remove lease: {ex.Message}");
                }
            }
        }

        private static void Write()
        {
            try
            {
                Directory.CreateDirectory(LeaseDirectory);
                string json = JsonSerializer.Serialize(new
                {
                    pid = Process.GetCurrentProcess().Id,
                    updatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                });
                string tmp = RevitLeaseFile + ".tmp";
                File.WriteAllText(tmp, json);
                File.Move(tmp, RevitLeaseFile, overwrite: true);
            }
            catch (Exception ex)
            {
                // A failed heartbeat must not break the connection it describes.
                FileLogger.LogError($"[SidecarLease] Could not write lease: {ex.Message}");
            }
        }
    }
}
