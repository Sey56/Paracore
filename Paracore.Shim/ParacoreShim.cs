using System;
using System.IO;
using System.Reflection;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Paracore.Shim
{
    /// <summary>
    /// Lightweight entry point that Revit loads directly.
    /// Has ZERO dependencies beyond Revit APIs, so it cannot conflict with any other add-in.
    /// It creates an isolated AssemblyLoadContext and loads the real Paracore.Addin into it.
    /// </summary>
    [Transaction(TransactionMode.Manual)]
    [Regeneration(RegenerationOption.Manual)]
    public class ParacoreShim : IExternalApplication
    {
        /// <summary>
        /// The full name of the real add-in's <c>IExternalApplication</c>, resolved out of the
        /// isolated context. A single source of truth: both the startup call and the
        /// pack-command resolver below need it, and two copies of this string would be a
        /// routing key with no compiler behind it.
        /// </summary>
        private const string AddinAppTypeName = "Paracore.Addin.App.ParacoreApp";

        /// <summary>
        /// How many pack-contributed ribbon buttons this shim can dispatch.
        ///
        /// ⚠ Revit instantiates a button's command by NAME, in an assembly it loads itself, so
        /// the shim has to PUBLISH a real class per button — one generic dispatcher cannot
        /// serve them all, because a class name is the only channel Revit gives us. Hence a
        /// fixed pool rather than a dynamic one. The add-in discovers the pool by reflection
        /// (<c>Paracore.Shim.PackCommandProxy&lt;n&gt;</c>) and fails loudly if a slot it needs
        /// is missing, so this number and the pool below can never drift apart silently.
        /// </summary>
        public const int MaxPackCommandSlots = 16;

        /// <summary>Static state shared with proxy commands.</summary>
        internal static IsolatedLoadContext? LoadContext { get; private set; }
        internal static Assembly? AddinAssembly { get; private set; }

        private object? _realApp;
        private MethodInfo? _shutdownMethod;

        public Result OnStartup(UIControlledApplication application)
        {
            try
            {
                var shimDir = Path.GetDirectoryName(typeof(ParacoreShim).Assembly.Location)!;
                Log($"Shim loaded from: {shimDir}");

                // Pass shimDir to the addin — Assembly.Location may be
                // empty in isolated load contexts (Add-in-Manager dev workflow).
                Environment.SetEnvironmentVariable("PARACORE_ADDIN_DIR", shimDir,
                    EnvironmentVariableTarget.Process);

                // 1. Create the isolated bubble
                LoadContext = new IsolatedLoadContext(shimDir);

                // 2. Load the real add-in INTO the bubble
                var addinPath = Path.Combine(shimDir, "Paracore.Addin.dll");
                if (!File.Exists(addinPath))
                {
                    Log($"CRITICAL: Paracore.Addin.dll not found at {addinPath}");
                    return Result.Failed;
                }

                AddinAssembly = LoadContext.LoadFromAssemblyPath(addinPath);
                Log("Loaded Paracore.Addin into isolated context");

                // 3. Find and create the real ParacoreApp
                var appType = AddinAssembly.GetType(AddinAppTypeName);
                if (appType == null)
                {
                    Log("CRITICAL: ParacoreApp type not found in loaded assembly");
                    return Result.Failed;
                }

                _realApp = Activator.CreateInstance(appType);

                // 4. Call OnStartup on the real app (inside the isolated bubble)
                var startupMethod = appType.GetMethod("OnStartup");
                _shutdownMethod = appType.GetMethod("OnShutdown");

                if (startupMethod == null)
                {
                    Log("CRITICAL: OnStartup method not found");
                    return Result.Failed;
                }

                var result = (Result)startupMethod.Invoke(_realApp, new object[] { application })!;
                Log($"ParacoreApp.OnStartup returned: {result}");

                return result;
            }
            catch (Exception ex)
            {
                var innerMsg = ex is TargetInvocationException tie && tie.InnerException != null
                    ? tie.InnerException.ToString()
                    : ex.ToString();
                Log($"FATAL: Shim startup failed:\n{innerMsg}");
                try
                {
                    TaskDialog.Show("Paracore - Startup Error",
                        $"Paracore failed to start:\n\n{(ex is TargetInvocationException t ? t.InnerException?.Message : ex.Message)}" +
                        "\n\nCheck ParacoreShimLog.txt in Documents for details.");
                }
                catch { }
                return Result.Failed;
            }
        }

        public Result OnShutdown(UIControlledApplication application)
        {
            try
            {
                if (_realApp != null && _shutdownMethod != null)
                {
                    var result = (Result)_shutdownMethod.Invoke(_realApp, new object[] { application })!;
                    return result;
                }
                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                Log($"Shutdown error: {ex.Message}");
                return Result.Failed;
            }
        }

        // -----------------------------------------------------------------------
        //  Command resolution
        //  Revit hands a proxy a class name and nothing else, so the proxy has to
        //  find the real command itself. Two kinds of command exist:
        //    • the add-in's own  — declared in Paracore.Addin.dll
        //    • a PACK's          — declared in an assembly loaded into the isolated
        //                          context, which the shim cannot name and must not
        //                          learn (it stays dependency-free).
        //  For the second kind the shim ASKS the add-in rather than being told, so
        //  no hard-coded name has to be agreed between the two assemblies.
        // -----------------------------------------------------------------------

        /// <summary>
        /// The add-in's own command by type name, or <see langword="null"/>.
        /// </summary>
        internal static Type? ResolveAddinCommandType(string commandTypeName)
            => AddinAssembly?.GetType(commandTypeName);

        /// <summary>
        /// The pack command that ribbon slot <paramref name="slot"/> was wired to, or
        /// <see langword="null"/> when the slot is out of range or unassigned.
        ///
        /// The mapping lives in the add-in because the add-in is what drew the ribbon, so it
        /// is the only thing that knows which button got which slot.
        /// </summary>
        internal static Type? ResolveSlotCommandType(int slot)
        {
            if (slot < 0 || slot >= MaxPackCommandSlots)
            {
                return null;
            }

            var resolver = AddinAssembly?
                .GetType(AddinAppTypeName)?
                .GetMethod("ResolvePackCommandTypeForSlot", BindingFlags.Public | BindingFlags.Static);

            return resolver?.Invoke(null, new object[] { slot }) as Type;
        }

        internal static void Log(string message)
        {
            try
            {
                var logDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "paracore-data", "logs");
                Directory.CreateDirectory(logDir);
                var logPath = Path.Combine(logDir, "ParacoreShimLog.txt");
                File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] {message}\n");
            }
            catch { }
        }
    }

    // -----------------------------------------------------------------------
    //  Proxy Commands
    //  These live in the Default context (where Revit invokes them), but they
    //  delegate to the REAL commands inside the isolated bubble via reflection.
    // -----------------------------------------------------------------------

    [Transaction(TransactionMode.Manual)]
    public class ToggleServerProxy : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            return ProxyHelper.ExecuteIsolated(
                "Paracore.Addin.Commands.ToggleServerCommand",
                commandData, ref message, elements);
        }
    }

    // -----------------------------------------------------------------------
    //  Pack-command proxy pool.
    //
    //  ⚠⚠ WHY THIS EXISTS. A pack-contributed button must NOT name the pack's own
    //  assembly. Revit resolves a button's assembly into the DEFAULT context, so a
    //  button pointing at Paracore.TakeOff.dll would load a SECOND copy of the pack
    //  there — and, with it, a second engine. The copy Revit ran would register into
    //  statics the REPL never reads, so a dialog would write settings the running
    //  engine ignores. This is also why "make takeoff a second add-in" is the wrong
    //  fix: a second add-in lands in the Default context too.
    //
    //  So the button names THIS assembly — which Revit already loaded — and the proxy
    //  forwards into the isolated context, exactly like ToggleServerProxy does for the
    //  add-in's own commands. A pack therefore never needs to be visible to Revit.
    // -----------------------------------------------------------------------

    /// <summary>
    /// Shared dispatch for the pack-command pool.
    ///
    /// ⚠ Public only because a public class cannot derive from a less-accessible one
    /// (CS0060). Revit instantiates the numbered subclasses; nothing should ever name this
    /// type in a ribbon button.
    /// </summary>
    public abstract class PackCommandProxyBase : IExternalCommand
    {
        /// <summary>Which pool slot this proxy dispatches — assigned by the numbered subclass.</summary>
        protected abstract int Slot { get; }

        /// <inheritdoc />
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
            => ProxyHelper.ExecuteIsolatedSlot(Slot, commandData, ref message, elements);
    }

    /// <summary>Pool slot 0. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy0 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 0; }

    /// <summary>Pool slot 1. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy1 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 1; }

    /// <summary>Pool slot 2. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy2 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 2; }

    /// <summary>Pool slot 3. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy3 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 3; }

    /// <summary>Pool slot 4. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy4 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 4; }

    /// <summary>Pool slot 5. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy5 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 5; }

    /// <summary>Pool slot 6. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy6 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 6; }

    /// <summary>Pool slot 7. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy7 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 7; }

    /// <summary>Pool slot 8. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy8 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 8; }

    /// <summary>Pool slot 9. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy9 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 9; }

    /// <summary>Pool slot 10. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy10 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 10; }

    /// <summary>Pool slot 11. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy11 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 11; }

    /// <summary>Pool slot 12. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy12 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 12; }

    /// <summary>Pool slot 13. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy13 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 13; }

    /// <summary>Pool slot 14. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy14 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 14; }

    /// <summary>Pool slot 15. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy15 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 15; }

    /// <summary>
    /// Helper that creates command instances in the isolated ALC and invokes Execute().
    /// </summary>
    internal static class ProxyHelper
    {
        /// <summary>
        /// Dispatches an add-in command, named explicitly.
        /// </summary>
        public static Result ExecuteIsolated(
            string commandTypeName,
            ExternalCommandData commandData,
            ref string message,
            ElementSet elements)
            => Execute(
                ParacoreShim.ResolveAddinCommandType(commandTypeName),
                commandTypeName,
                commandData,
                ref message,
                elements);

        /// <summary>
        /// Dispatches a pack command by ribbon slot. The slot -> type mapping is the
        /// add-in's; see <see cref="ParacoreShim.ResolveSlotCommandType"/>.
        /// </summary>
        public static Result ExecuteIsolatedSlot(
            int slot,
            ExternalCommandData commandData,
            ref string message,
            ElementSet elements)
            => Execute(
                ParacoreShim.ResolveSlotCommandType(slot),
                $"ribbon slot {slot}",
                commandData,
                ref message,
                elements);

        private static Result Execute(
            Type? commandType,
            string label,
            ExternalCommandData commandData,
            ref string message,
            ElementSet elements)
        {
            if (ParacoreShim.AddinAssembly == null)
            {
                message = "Paracore is not initialized. Please restart Revit.";
                return Result.Failed;
            }

            if (commandType == null)
            {
                // ⚠ Reached when the add-in did not wire this slot — i.e. the button and the
                // mapping disagree. Say so plainly rather than reporting a missing type, so
                // the log points at the wiring and not at a typo in a name.
                message = $"No Paracore command is registered for {label}.";
                ParacoreShim.Log($"Proxy: {label} has no registered command type.");
                return Result.Failed;
            }

            try
            {
                var cmd = Activator.CreateInstance(commandType)!;
                var executeMethod = commandType.GetMethod("Execute")!;

                // Reflection handles 'ref' parameters through the args array
                var args = new object?[] { commandData, message, elements };
                var result = (Result)executeMethod.Invoke(cmd, args)!;
                message = (string)(args[1] ?? string.Empty);
                return result;
            }
            catch (TargetInvocationException ex) when (ex.InnerException != null)
            {
                ParacoreShim.Log($"Command '{label}' ({commandType.FullName}) failed: {ex.InnerException}");
                message = ex.InnerException.Message;
                return Result.Failed;
            }
            catch (Exception ex)
            {
                ParacoreShim.Log($"Proxy error for '{label}' ({commandType.FullName}): {ex}");
                message = ex.Message;
                return Result.Failed;
            }
        }
    }
}
