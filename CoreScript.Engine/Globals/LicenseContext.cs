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
        /// The current license tier: "enterprise" or "free" (default).
        /// </summary>
        public static string Tier
        {
            get => _tier ?? "free";
            set => _tier = value;
        }

        /// <summary>
        /// Returns true if the current execution context has enterprise privileges.
        /// </summary>
        public static bool IsEnterprise => string.Equals(Tier, "enterprise", StringComparison.OrdinalIgnoreCase);

        /// <summary>
        /// Guard method — call at the top of every enterprise-only extension method.
        /// Throws a clear, user-friendly error if the user is on the free tier.
        /// </summary>
        public static void RequireEnterprise(string featureName)
        {
            if (!IsEnterprise)
            {
                throw new LicenseException(
                    $"🔒 '{featureName}' is an Enterprise feature. " +
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
