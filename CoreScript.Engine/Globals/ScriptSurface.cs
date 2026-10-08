using System.Text;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// The engine's script-surface extension point.
    ///
    /// The engine is free and knows nothing about any Pro feature, but every script it
    /// compiles begins with a fixed block of `using static` directives naming
    /// <see cref="ScriptApi"/>. A Pro pack such as Paracore.TakeOff cannot add members to
    /// <see cref="ScriptApi"/> — a `partial class` cannot span assemblies — so instead the
    /// pack ANNOUNCES its own script-facing type here, and the engine appends one further
    /// `using static` to every script it compiles. The dependency points outward: a pack
    /// references the engine, never the other way round.
    ///
    /// Registering a type also registers the ASSEMBLY that declares it as a script
    /// compilation reference. That is what makes a pack's extension methods visible to
    /// scripts too, because they keep living in the engine's own
    /// `CoreScript.Engine.Globals` namespace — a namespace the engine already imports.
    ///
    /// ⚠ Register from the pack's own module initializer, so the surface is present exactly
    /// when the pack is loaded, with no coordination required from the host.
    /// </summary>
    public static class ScriptSurface
    {
        private static readonly object _gate = new();
        private static readonly List<string> _staticImportTypes = [];
        private static readonly List<string> _referencePaths = [];

        /// <summary>
        /// Exposes <paramref name="scriptFacingType"/>'s public static members to every
        /// script by adding `using static &lt;type&gt;;` to the script preamble, and makes
        /// the assembly declaring it available to the script compiler.
        /// Idempotent, and safe to call from any thread.
        /// </summary>
        /// <param name="scriptFacingType">
        /// The pack's script-facing static class. Its namespace becomes the target of the
        /// injected `using static`, so it must not be a global-namespace type.
        /// </param>
        public static void AddStaticImport(Type scriptFacingType)
        {
            ArgumentNullException.ThrowIfNull(scriptFacingType);

            string fullName = scriptFacingType.FullName
                ?? throw new ArgumentException(
                    "A script-facing type must be declared inside a namespace — `using static` cannot name a global type.",
                    nameof(scriptFacingType));

            lock (_gate)
            {
                if (!_staticImportTypes.Contains(fullName))
                {
                    _staticImportTypes.Add(fullName);
                }

                string location = scriptFacingType.Assembly.Location;
                if (!string.IsNullOrEmpty(location) && !_referencePaths.Contains(location))
                {
                    _referencePaths.Add(location);
                }
            }
        }

        /// <summary>
        /// The pack-contributed `using static` directives, rendered as ONE line, to be
        /// appended to the engine's own `using static CoreScript.Engine.Globals.ScriptApi;`.
        /// Empty when no pack has registered a surface — which is what keeps the emitted
        /// preamble byte-identical to a build running with no pack loaded.
        ///
        /// ⚠ Deliberately ONE line. The preamble is injected ahead of `#line`-mapped user
        /// code, so changing the NUMBER of injected lines would shift every diagnostic
        /// position the user is shown. Callers append this to the ScriptApi import; they
        /// never add it as a new line.
        /// </summary>
        public static string StaticImportsLine
        {
            get
            {
                lock (_gate)
                {
                    if (_staticImportTypes.Count == 0)
                    {
                        return string.Empty;
                    }

                    StringBuilder line = new();
                    foreach (string typeName in _staticImportTypes)
                    {
                        _ = line.Append(" using static ").Append(typeName).Append(';');
                    }

                    return line.ToString();
                }
            }
        }

        /// <summary>
        /// Assemblies the script compiler must reference, contributed by the packs that
        /// registered a surface. Read by <c>ScriptReferenceProvider</c>.
        /// </summary>
        public static IReadOnlyList<string> ReferencePaths
        {
            get
            {
                lock (_gate)
                {
                    return [.. _referencePaths];
                }
            }
        }
    }
}
