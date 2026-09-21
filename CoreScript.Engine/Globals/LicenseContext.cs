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
        /// True when the loaded engine is the Pro build — detected once by probing
        /// a Pro-only type (ProPaths is compiled only in the pro repo; the free
        /// engine ships without it). Chosen because it references no Revit types,
        /// so the probe cannot fail on missing Revit references. This keeps every
        /// enterprise gate closed in a free add-in regardless of any tier claim
        /// from the execution host.
        /// </summary>
        private static readonly bool _proEngine =
            typeof(LicenseContext).Assembly.GetType("CoreScript.Engine.Globals.ProPaths") != null;

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
        /// the host must claim the enterprise tier AND the loaded engine must be
        /// the Pro build.
        /// </summary>
        public static bool IsEnterprise =>
            string.Equals(Tier, "enterprise", StringComparison.OrdinalIgnoreCase) && _proEngine;

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
                    !_proEngine
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
