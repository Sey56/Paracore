namespace CoreScript.Engine.Packs
{
    /// <summary>
    /// A pack: the unit that carries a SPECIALIST capability on top of the always-generic
    /// engine. The engine and the add-in are free and generalist; a pack is what makes a
    /// specialist tool — takeoff, BOQ, clash detection — available to every host that
    /// executes scripts through this engine (the Paracore desktop app, the generalist MCPs,
    /// or the specialist MCP that ships the pack).
    ///
    /// A pack is loaded by the generic add-in at startup from a pack root
    /// (see <see cref="PackCatalog"/>), into the same isolated AssemblyLoadContext that
    /// holds the engine, so that what it registers is visible to the engine.
    ///
    /// ⚠ An implementation MUST have a public parameterless constructor: the loader
    /// discovers implementations by reflection and instantiates them.
    ///
    /// ⚠ Do NOT try to contribute to the add-in through a `partial` method hook
    /// (`LoadProSettings`, `AddProRibbonButtons`, …). A partial method's body must live in
    /// the same assembly as its declaration, and a pack is a separate assembly by
    /// definition. Contribute at RUNTIME through <see cref="Register"/> instead.
    /// </summary>
    public interface IParacorePack
    {
        /// <summary>
        /// Stable identifier for diagnostics and logs — never a routing key, never parsed.
        /// </summary>
        string Name { get; }

        /// <summary>
        /// Called once when the generic add-in loads this pack, before any script is compiled.
        /// This is where a pack announces itself: opening the enterprise gate
        /// (<c>CoreScript.Engine.Globals.LicenseContext.RegisterProBuild</c>) and publishing
        /// its script-facing surface
        /// (<c>CoreScript.Engine.Globals.ScriptSurface.AddStaticImport</c>).
        ///
        /// ⚠ Must be idempotent: a host may also load the pack through its own module
        /// initializer, so this can run twice in one process.
        /// </summary>
        void Register();
    }
}
