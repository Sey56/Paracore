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
        //  ⚠ Must equal the number of PackCommandProxyN classes in this file. Raised 16 -> 64
        //  because a ribbon contribution is no longer always ONE button: a pulldown or split
        //  button carries several commands, and each one needs its own slot. A pack that
        //  overruns the pool is reported by the host (see ParacoreApp.BuildPackRibbon) rather
        //  than silently losing buttons.
        public const int MaxPackCommandSlots = 64;

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

    /// <summary>Pool slot 16. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy16 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 16; }

    /// <summary>Pool slot 17. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy17 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 17; }

    /// <summary>Pool slot 18. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy18 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 18; }

    /// <summary>Pool slot 19. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy19 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 19; }

    /// <summary>Pool slot 20. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy20 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 20; }

    /// <summary>Pool slot 21. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy21 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 21; }

    /// <summary>Pool slot 22. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy22 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 22; }

    /// <summary>Pool slot 23. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy23 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 23; }

    /// <summary>Pool slot 24. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy24 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 24; }

    /// <summary>Pool slot 25. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy25 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 25; }

    /// <summary>Pool slot 26. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy26 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 26; }

    /// <summary>Pool slot 27. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy27 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 27; }

    /// <summary>Pool slot 28. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy28 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 28; }

    /// <summary>Pool slot 29. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy29 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 29; }

    /// <summary>Pool slot 30. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy30 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 30; }

    /// <summary>Pool slot 31. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy31 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 31; }

    /// <summary>Pool slot 32. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy32 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 32; }

    /// <summary>Pool slot 33. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy33 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 33; }

    /// <summary>Pool slot 34. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy34 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 34; }

    /// <summary>Pool slot 35. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy35 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 35; }

    /// <summary>Pool slot 36. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy36 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 36; }

    /// <summary>Pool slot 37. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy37 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 37; }

    /// <summary>Pool slot 38. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy38 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 38; }

    /// <summary>Pool slot 39. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy39 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 39; }

    /// <summary>Pool slot 40. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy40 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 40; }

    /// <summary>Pool slot 41. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy41 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 41; }

    /// <summary>Pool slot 42. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy42 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 42; }

    /// <summary>Pool slot 43. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy43 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 43; }

    /// <summary>Pool slot 44. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy44 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 44; }

    /// <summary>Pool slot 45. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy45 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 45; }

    /// <summary>Pool slot 46. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy46 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 46; }

    /// <summary>Pool slot 47. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy47 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 47; }

    /// <summary>Pool slot 48. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy48 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 48; }

    /// <summary>Pool slot 49. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy49 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 49; }

    /// <summary>Pool slot 50. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy50 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 50; }

    /// <summary>Pool slot 51. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy51 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 51; }

    /// <summary>Pool slot 52. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy52 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 52; }

    /// <summary>Pool slot 53. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy53 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 53; }

    /// <summary>Pool slot 54. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy54 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 54; }

    /// <summary>Pool slot 55. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy55 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 55; }

    /// <summary>Pool slot 56. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy56 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 56; }

    /// <summary>Pool slot 57. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy57 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 57; }

    /// <summary>Pool slot 58. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy58 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 58; }

    /// <summary>Pool slot 59. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy59 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 59; }

    /// <summary>Pool slot 60. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy60 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 60; }

    /// <summary>Pool slot 61. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy61 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 61; }

    /// <summary>Pool slot 62. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy62 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 62; }

    /// <summary>Pool slot 63. See <see cref="PackCommandProxyBase"/>.</summary>
    [Transaction(TransactionMode.Manual)]
    public class PackCommandProxy63 : PackCommandProxyBase { /// <inheritdoc/>
        protected override int Slot => 63; }

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
