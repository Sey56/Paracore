using System;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Thread-safe license tier context for engine-level enterprise feature gating.
    /// Set by the execution host (ReplSessionManager / ScriptExecutor) before code runs.
    /// Checked by enterprise extension methods at invocation time.
    /// </summary>
    public static class LicenseContext
    {
        [ThreadStatic]
        private static string _tier;

        /// <summary>
        /// Set once when a Pro artifact announces itself — see <see cref="RegisterProBuild"/>.
        /// Process-wide, because it describes what is LOADED, not who is running.
        /// `volatile`: the announcement arrives from whichever thread loaded the artifact.
        /// </summary>
        private static volatile bool _proBuildRegistered;

        /// <summary>
        /// LEGACY probe, kept as a fallback while Pro code still ships inside the engine:
        /// `ProPaths` is compiled only in the pro repo, and it references no Revit types,
        /// so the probe cannot fail on missing Revit references.
        ///
        /// ⚠ It is NOT the long-term mechanism, and it is scheduled to die. `ProPaths` is
        /// the takeoff's own settings-path helper, so it leaves the engine together with
        /// the Pro features — and the moment it does, this probe answers false forever and
        /// EVERY enterprise gate below would throw for a paying customer. That is exactly
        /// why <see cref="RegisterProBuild"/> exists; do not delete this fallback until the
        /// Pro artifacts are known to announce themselves.
        /// </summary>
        private static readonly bool _legacyProEngine =
            typeof(LicenseContext).Assembly.GetType("CoreScript.Engine.Globals.ProPaths") != null;

        /// <summary>
        /// True when the Pro bits are physically present in this process.
        ///
        /// ⚠ Deliberately an EXPLICIT announcement, never a scan of the loaded assemblies
        /// for one named "Paracore.TakeOff". A display string is a routing key, not a label:
        /// a rename would not error, it would silently open every gate.
        /// </summary>
        private static bool ProBitsPresent => _proBuildRegistered || _legacyProEngine;

        /// <summary>
        /// Announces that a Pro artifact is loaded in this process — the Pro add-in, or a
        /// Pro pack such as Paracore.TakeOff. Call it from the artifact's own module
        /// initializer, so the flag is set exactly when the Pro bits are, with no
        /// coordination from the host and no dependency on any Pro type living inside the
        /// engine. Idempotent, and safe to call from any thread.
        /// </summary>
        public static void RegisterProBuild()
        {
            _proBuildRegistered = true;
        }

        /// <summary>
        /// The current license tier: "enterprise" or "free" (default).
        /// </summary>
        public static string Tier
        {
            get => _tier ?? "free";
            set => _tier = value;
        }

        /// <summary>
        /// Returns true if the current execution context has enterprise privileges:
        /// the host must claim the enterprise tier AND the Pro bits must be present in
        /// this process.
        /// </summary>
        public static bool IsEnterprise =>
            string.Equals(Tier, "enterprise", StringComparison.OrdinalIgnoreCase) && ProBitsPresent;

        /// <summary>
        /// Guard method — call at the top of every enterprise-only extension method.
        /// The tier claim comes from the execution host: the desktop app derives it
        /// from Google sign-in; the pro MCPs from their own gates. (Spec A10 — the
        /// hardware-license layer of A9 was reverted by product decision.)
        /// </summary>
        public static void RequireEnterprise(string featureName)
        {
            if (!IsEnterprise)
            {
                throw new LicenseException(
                    !ProBitsPresent
                        ? $"🔒 '{featureName}' is a Paracore Pro feature. Install the Paracore Pro Add-in to unlock."
                        : $"🔒 '{featureName}' is an Enterprise feature. " +
                          $"Sign in with Google in Paracore to unlock.");
            }
        }

        /// <summary>
        /// Resets the tier to free. Call in finally blocks after execution.
        /// </summary>
        public static void Reset()
        {
            _tier = null;
        }
    }

    /// <summary>
    /// Custom exception for license-gated feature access violations.
    /// </summary>
    public class LicenseException : Exception
    {
        public LicenseException(string message) : base(message) { }
    }
}
