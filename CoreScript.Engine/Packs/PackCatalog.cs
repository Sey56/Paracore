namespace CoreScript.Engine.Packs
{
    /// <summary>
    /// Where packs live on disk, and how to enumerate them.
    ///
    /// ⚠⚠ PACKS MUST NEVER LIVE INSIDE THE REVIT ADD-IN FOLDER. The add-in installer's
    /// `[InstallDelete]` does `Type: filesandordirs` on the whole
    /// `{commonappdata}\Autodesk\Revit\Addins\&lt;year&gt;\Paracore` tree, so every add-in
    /// upgrade would silently destroy any pack kept there. That is the entire reason this
    /// catalogue exists as a separate location.
    ///
    /// Layout — one folder per pack, DLLs directly inside it:
    /// <code>
    /// &lt;root&gt;\&lt;PackName&gt;\&lt;PackAssembly&gt;.dll
    /// </code>
    ///
    /// ⚠ The shim duplicates these two roots (see <c>Paracore.Shim.IsolatedLoadContext</c>).
    /// The shim is deliberately dependency-free — it must not reference the engine — so the
    /// pair cannot be shared. <b>Change both together.</b>
    /// </summary>
    public static class PackCatalog
    {
        /// <summary>Machine-wide root — survives add-in upgrades, needs elevation to write.</summary>
        public static string MachineRoot { get; } = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Paracore", "Packs");

        /// <summary>
        /// Per-user root — no elevation needed, and the natural sibling of the per-user data
        /// folder the MCP servers already install into
        /// (`{userappdata}\paracore-data\mcp-servers`). This is what lets a pack ship in the
        /// SAME installer as its MCP, which runs as `PrivilegesRequired=lowest`.
        /// </summary>
        public static string UserRoot { get; } = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "paracore-data", "packs");

        /// <summary>
        /// Every root that is searched for packs, machine-wide first. Exposed so a host can
        /// report WHERE it looked — a pack that fails to load is almost always a pack that
        /// was installed into a root nobody probes.
        /// </summary>
        public static IReadOnlyList<string> Roots { get; } = [MachineRoot, UserRoot];

        /// <summary>
        /// Every candidate pack assembly, one entry per DLL directly inside a pack folder.
        /// Dependency DLLs a pack happens to ship alongside are included; the loader skips
        /// them, because they declare no <see cref="IParacorePack"/>.
        /// </summary>
        public static IEnumerable<string> EnumerateAssemblies()
        {
            foreach (string root in Roots)
            {
                if (string.IsNullOrEmpty(root) || !Directory.Exists(root))
                {
                    continue;
                }

                foreach (string packDir in Directory.EnumerateDirectories(root))
                {
                    foreach (string dll in Directory.EnumerateFiles(packDir, "*.dll"))
                    {
                        yield return dll;
                    }
                }
            }
        }
    }
}
