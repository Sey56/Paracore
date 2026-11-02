using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Scripting;
using System;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.IO;
using System.Linq;

namespace CoreScript.Engine.Core
{
    /// <summary>
    /// Thrown when a snippet names a capability the sandbox refuses. A distinct type so the
    /// dispatcher can report it as a REFUSAL rather than as a script bug.
    /// </summary>
    public sealed class ScriptSandboxViolation : Exception
    {
        /// <summary>Creates the exception with the agent-facing explanation.</summary>
        public ScriptSandboxViolation(string message) : base(message) { }
    }

    /// <summary>
    /// The CAPABILITY boundary for agent-authored scripts.
    ///
    /// <para><b>What this is, precisely.</b> Not an isolation sandbox — that is impossible here:
    /// the script must share Revit's process to hold a <c>Document</c>, and .NET 8 has no CAS
    /// and no security <c>AppDomain</c>. This is the OTHER kind: the script cannot NAME a
    /// capability it was not given. Same mechanism that makes WebAssembly a sandbox — the host
    /// supplies every import, so <c>fd_open</c> simply does not exist.</para>
    ///
    /// <para><b>Why it exists (2026-11-01).</b> The text scan in the MCP is a filter, not a
    /// boundary: it was measured passing <c>new FileInfo(p).Create()</c>,
    /// <c>Process.GetCurrentProcess().Kill()</c> and <c>new Process(); p.Start();</c>. A text
    /// rule is defeated by any spelling it does not name; a SYMBOL cannot be spelled around,
    /// because the compiler resolves it. So the rule lives here, at the semantic level, where
    /// qualification, aliasing and <c>#r</c> are all visible.</para>
    ///
    /// <para><b>⚠ WHAT THIS DOES NOT DO.</b> It does not stop a snippet from doing anything to
    /// the MODEL — that is the product, and transactions cover it. The Revit API is deliberately
    /// left whole: an agent that edits the wrong wall is doing its job badly, not escaping a
    /// sandbox. It does not stop resource exhaustion (<c>new byte[2GB]</c>, a loop inside a
    /// framework call). It does not sandbox a PACK, which ships IL and is never compiled. Say
    /// so; do not let this class be described as a sandbox.</para>
    /// </summary>
    public static class ScriptSandbox
    {
        /// <summary>
        /// A resolver that refuses EVERY <c>#r</c> directive.
        ///
        /// <para>⚠⚠ This is the hole that made every other restriction advisory. The reference
        /// set was "closed" only by convention: <c>ScriptOptions.Default</c> carries a
        /// <c>RuntimeMetadataReferenceResolver</c> that resolves an assembly BY NAME from the
        /// trusted platform list, so <c>#r "System.Diagnostics.Process"</c> re-opened a
        /// capability the compiler had not been given. Returning an empty set turns that into
        /// a compile error — loud, immediate, and addressed to the author of the snippet.</para>
        /// </summary>
        public static readonly MetadataReferenceResolver NoReferences = new RefuseReferences();

        /// <summary>
        /// A resolver that refuses every <c>#load</c> directive. <c>#load</c> reads and compiles
        /// a FILE at compile time, which would route around the reference set entirely.
        /// </summary>
        public static readonly SourceReferenceResolver NoLoads = new RefuseLoads();

        /// <summary>
        /// Namespaces a snippet may not name. Prefix-matched, so <c>System.Net</c> covers
        /// <c>System.Net.Sockets</c>.
        ///
        /// <para>⚠ Every entry here is a MACHINE capability, not a model one. Nothing in a
        /// takeoff, a model edit or a family build needs any of them — that is why this list
        /// costs no legitimate capability. If a future recipe genuinely needs one, that is a
        /// design conversation, not a reason to delete the row.</para>
        /// </summary>
        private static readonly string[] ForbiddenNamespaces =
        {
            "System.Diagnostics",              // Process, EventLog, Debugger
            "System.Net",                      // sockets, HTTP, DNS, SMTP
            "Microsoft.Win32",                 // registry, SafeHandles
            "System.Runtime.InteropServices",  // P/Invoke, Marshal, NativeLibrary
            "System.Runtime.Loader",           // load an assembly BY PATH — no legit script use
            "System.Reflection",               // assembly loading, member resolution
            "System.Security.Cryptography",    // encryption of the user's files
            "System.Management",               // WMI — runs commands
            "System.ServiceProcess",           // services
            "System.CodeDom.Compiler",         // runtime code generation
        };

        /// <summary>
        /// Namespaces refused on the <c>execute_repl</c> channel ONLY.
        ///
        /// <para><c>System.IO</c>: a file a snippet creates outlives the run, and a
        /// <c>.addin</c> planted in a Revit Addins folder is loaded at the next launch with no
        /// sandbox. The sanctioned route is <c>ScriptApi.Files</c>, which confines every path to
        /// one workspace folder at RUNTIME — a compile-time rule cannot check a path VALUE, so
        /// this ban and that façade are two halves of one decision, not alternatives.</para>
        ///
        /// <para>⚠⚠ <c>System.Threading</c> (added 2026-11-01, reasoned not measured): banning the
        /// whole namespace is what makes <c>Task.Run</c> unreachable. Enumerating
        /// <c>Thread</c> and <c>ThreadPool</c> as TYPES left <c>System.Threading.Tasks</c> open,
        /// and <c>Task.Run(() =&gt; while(true) {})</c> escapes the injected budget exactly the way
        /// <c>new Thread</c> did — the snippet returns while the work keeps running, so there is
        /// nothing left for <c>CheckBudget</c> to run inside. Prefix matching covers
        /// <c>System.Threading.Tasks</c> too. No legitimate Revit script needs it: the Revit API
        /// is single-threaded and the model may only be touched from the calling thread.</para>
        /// </summary>
        private static readonly string[] ReplNamespaces = { "System.IO", "System.Threading" };

        /// <summary>
        /// The namespaces refused on the <c>execute_repl</c> channel. Kept as a named field
        /// because <see cref="ChannelRestrictions"/> and the docs both point at it.
        /// </summary>
        public static readonly IReadOnlyCollection<string> ReplOnlyNamespaces = ReplNamespaces;

        /// <summary>
        /// A whole TYPE refused on one channel. Catches <c>new Thread(...)</c>,
        /// <c>AppDomain.CurrentDomain</c> and any other use where the identifier resolves to the
        /// type itself rather than to one of its members.
        /// </summary>
        private static readonly string[] ReplTypes =
        {
            // Assembly enumeration / loading at runtime. The string route to System.IO and to
            // Process starts here: `AppDomain.CurrentDomain.GetAssemblies()` hands back the
            // assemblies a snippet was never given.
            //
            // ⚠ Thread and ThreadPool USED to be listed here. They are gone on purpose: the
            //   `System.Threading` namespace ban in ReplNamespaces now covers them AND
            //   `System.Threading.Tasks`, which the type list never did. A rule that enumerates
            //   types is a rule someone has to remember to extend; the namespace rule is not.
            "System.AppDomain",
        };

        /// <summary>
        /// ONE MEMBER of an otherwise-allowed type, refused on one channel.
        ///
        /// <para><b>Why member-level and not namespace-level.</b> These all live in
        /// <c>System</c>, which every script needs — <c>Println</c> itself takes a
        /// <c>string</c>. A namespace rule cannot separate <c>Environment.GetEnvironmentVariable</c>
        /// from <c>Environment.NewLine</c>, so the rule has to name the member.</para>
        ///
        /// <para><b>Why they are refused at all (measured 2026-11-01).</b>
        /// <c>Environment.GetEnvironmentVariable("USERNAME")</c> returned <c>seyou</c> on the
        /// installed build — it passed BOTH the text scan and the namespace rule, because
        /// <c>System.Environment</c> sits in <c>System</c>. Whatever a snippet reads comes back
        /// through tool output to the model provider, so that is a credential-egress channel:
        /// environment variables on a workstation hold licence keys, proxy credentials and cloud
        /// tokens. The <c>Type</c>/<c>Activator</c> rows close the STRING route — a banned type
        /// named inside a string resolves to no symbol, so the namespace rule never sees it.</para>
        /// </summary>
        private static readonly (string Type, string Member)[] ReplMembers =
        {
            // Credential egress: the value returns in tool output.
            ("System.Environment", "GetEnvironmentVariable"),
            ("System.Environment", "GetEnvironmentVariables"),

            // ── Host fingerprint (measured 2026-11-01 by an external review) ────────────────
            // CurrentDirectory returned the Revit INSTALL path and GetCommandLineArgs returned
            // an argument count. Revit is commonly launched with the model path as an argument,
            // so printing the arguments leaks a project path — and a project path names a client.
            // The rest are the same fact by another spelling: GetFolderPath and
            // ExpandEnvironmentVariables both hand back C:\Users\<name>, GetLogicalDrives
            // enumerates the machine's volumes, MachineName and UserName identify it outright.
            // None of them is a modelling capability. Environment.NewLine and
            // typeof(x).AssemblyQualifiedName stay allowed: they leak nothing and banning them
            // breaks innocent code.
            ("System.Environment", "CurrentDirectory"),
            ("System.Environment", "GetCommandLineArgs"),
            ("System.Environment", "CommandLine"),
            ("System.Environment", "GetFolderPath"),
            ("System.Environment", "ExpandEnvironmentVariables"),
            ("System.Environment", "GetLogicalDrives"),
            ("System.Environment", "SystemDirectory"),
            ("System.Environment", "MachineName"),
            ("System.Environment", "UserName"),
            ("System.AppContext", "BaseDirectory"),

            // Terminating the host: kills Revit and discards unsaved work with no transaction.
            ("System.Environment", "Exit"),
            ("System.Environment", "FailFast"),

            // The string route: resolve a banned type by NAME, then construct it.
            ("System.Type", "GetType"),
            ("System.Type", "GetTypeFromProgID"),
            ("System.Type", "GetTypeFromCLSID"),
            ("System.Type", "ReflectionOnlyGetType"),
            ("System.Activator", "CreateInstance"),

            // Binding to a method by NAME at runtime — the same idea as Type.GetType, one step
            // removed. With the reference set closed every route to a banned TYPE is already
            // refused (measured: an alias `using T = System.Type; T.GetType(...)` is caught by
            // the symbol walk), so this is belt-and-braces on the last dynamic-binding primitive
            // that is not itself inside a banned namespace.
            ("System.Delegate", "CreateDelegate"),
        };

        /// <summary>
        /// MEMBER NAMES refused on any <c>Autodesk.Revit.*</c> type, on one channel.
        ///
        /// <para><b>Why these and not the whole Revit API.</b> The operator's ruling is that the
        /// model is fair game — an agent that edits the wrong wall is doing its job badly, not
        /// escaping a sandbox. These are not model operations. Every one of them WRITES OR READS
        /// A FILE at a caller-chosen path: <c>SaveAs</c> and <c>Export</c> are file primitives
        /// wearing a Revit hat, and with <c>System.IO</c> refused they were the last way a
        /// snippet could put a file anywhere on disk. <c>ExportImage</c> is here for the same
        /// reason and is the sharpest case: Revit writes the bytes, so no reference-set rule can
        /// see it.</para>
        ///
        /// <para>⚠ The engine's own <c>ScriptApi.ExportImage</c> is NOT refused — it lives in
        /// <c>CoreScript.Engine.Globals</c>, not in <c>Autodesk.Revit</c>, and it routes its
        /// target through <c>ScriptApi.Files.Resolve</c> instead. That is the sanctioned export
        /// and it still works.</para>
        /// </summary>
        private static readonly string[] ReplRevitFileMembers =
        {
            "Save",              // Document.Save
            "SaveAs",            // Document.SaveAs — writes a .rvt anywhere
            // ⚠ NOT "SaveAsCentral": it does not exist in the Revit 2025 API (checked against
            //   RevitAPI.xml — Document has SaveAs and SaveAsCloudModel only). An entry that can
            //   never fire is a coverage claim with no failure mode, which is the defect class
            //   this file exists to avoid. Add it back only when the API has it.
            "Export",            // Document.Export, ViewSchedule.Export — DXF/IFC/CSV to any path
            "ExportImage",       // Document.ExportImage — Revit writes the raster
            "ExportSchedule",
            "OpenDocumentFile",  // Application.OpenDocumentFile — reads a file by path
            "LoadFamily",        // Document.LoadFamily — reads a .rfa by path
            "LoadFamilySymbol",
            "Import",            // Document.Import — reads a file by path
        };

        /// <summary>
        /// Everything refused on the <c>execute_repl</c> channel, in ONE object.
        ///
        /// <para><b>Why a bundle rather than three parameters.</b> A caller that passed the
        /// namespace list and forgot the type/member lists would get a silently partial
        /// sandbox — the exact failure mode this codebase keeps meeting. You pass the channel
        /// and get all of it, or you pass nothing and get none of it.</para>
        ///
        /// <para><b>Why the channel split is by LEGITIMATE USE, not by trust.</b> File access
        /// and environment reads are things a shipped gallery tool may genuinely need
        /// (<c>RoomFinishUpdater</c> reads a CSV and writes one), so they are refused on the
        /// REPL channel only. That is NOT keying protection on the caller's <c>source</c>
        /// string, which was rejected on 2026-11-01 — the two entry points are structurally
        /// different channels with different lifetimes.</para>
        ///
        /// <para><b>Why file access has to go (measured 2026-11-01).</b> Agent code could
        /// create a file with <c>FileMode.CreateNew</c>, and
        /// <c>C:\ProgramData\Autodesk\Revit\Addins\2025</c> granted
        /// <c>BUILTIN\Users:(CI)(WD,AD,WEA,WA)</c> — Users may CREATE there. A <c>.addin</c>
        /// manifest planted in that folder is loaded by Revit at the NEXT LAUNCH, with no
        /// sandbox and no consent. That is a file outliving the run, which no in-process check
        /// can undo, so the channel must not be able to create one at all. The same refusal
        /// closes the read side: enumeration and existence probes were measured working
        /// (<c>C:\</c>, the user profile, the Chrome profile), and whatever a snippet reads
        /// comes back through tool output to the model provider.</para>
        /// </summary>
        public static readonly ChannelRestrictions ReplChannel =
            new ChannelRestrictions(
                "execute_repl", ReplNamespaces, ReplTypes, ReplMembers, ReplRevitFileMembers);

        /// <summary>
        /// The refusals that apply to ONE channel only. See <see cref="ReplChannel"/>.
        /// </summary>
        public sealed class ChannelRestrictions
        {
            /// <summary>Creates a channel's refusal set.</summary>
            public ChannelRestrictions(
                string name,
                IReadOnlyCollection<string> namespaces,
                IReadOnlyCollection<string> types,
                IReadOnlyCollection<(string Type, string Member)> members,
                IReadOnlyCollection<string> revitFileMembers)
            {
                Name = name;
                Namespaces = namespaces;
                Types = types;
                Members = members;
                RevitFileMembers = revitFileMembers;
            }

            /// <summary>The entry point this set applies to, for the refusal message.</summary>
            public string Name { get; }

            /// <summary>Namespaces refused on this channel (prefix-matched).</summary>
            public IReadOnlyCollection<string> Namespaces { get; }

            /// <summary>Whole types refused on this channel (exact full name).</summary>
            public IReadOnlyCollection<string> Types { get; }

            /// <summary>Single members refused on this channel (exact owner and member name).</summary>
            public IReadOnlyCollection<(string Type, string Member)> Members { get; }

            /// <summary>
            /// Member names refused on ANY <c>Autodesk.Revit.*</c> type — the file primitives.
            /// Matched by NAME because the owner varies by overload (<c>Document.Export</c> vs
            /// <c>ViewSchedule.Export</c>) and enumerating every owner would be a list that
            /// drifts. See <see cref="ReplRevitFileMembers"/>.
            /// </summary>
            public IReadOnlyCollection<string> RevitFileMembers { get; }
        }

        /// <summary>
        /// Applies the capability boundary to a <see cref="ScriptOptions"/> instance. Every
        /// place that builds options must pass through here — a compile site that skips it is a
        /// bypass, which is why this is one method rather than three copies of two calls.
        /// </summary>
        /// <param name="options">The options as built by the caller.</param>
        /// <returns>The same options with the reference and source resolvers refused.</returns>
        public static ScriptOptions Harden(ScriptOptions options)
        {
            if (options == null) throw new ArgumentNullException(nameof(options));
            return options
                .WithMetadataResolver(NoReferences)
                .WithSourceResolver(NoLoads);
        }

        /// <summary>
        /// Returns the first forbidden capability reached by <paramref name="tree"/>, or null.
        ///
        /// <para>⚠ It walks SYMBOLS, not text: <c>System.Diagnostics.Process</c>,
        /// <c>using D = System.Diagnostics; D.Process</c>, and <c>using static
        /// System.Diagnostics.Process;</c> all resolve to the same <c>INamedTypeSymbol</c>, so
        /// there is no spelling that gets around this the way it gets around a regex.</para>
        /// </summary>
        /// <param name="compilation">The compilation the tree belongs to.</param>
        /// <param name="tree">One syntax tree from that compilation.</param>
        /// <param name="channel">
        /// Channel-scoped refusals, or null. <c>ReplSessionManager</c> passes
        /// <see cref="ReplChannel"/> at BOTH of its compile sites; <c>ScriptCompiler</c> passes
        /// nothing, because a gallery tool's file access is the product working.
        /// </param>
        /// <returns>A human-readable violation, or null.</returns>
        public static string? FindForbidden(
            Compilation compilation, SyntaxTree tree, ChannelRestrictions? channel = null)
        {
            if (compilation == null || tree == null) return null;

            SemanticModel model;
            try { model = compilation.GetSemanticModel(tree); }
            catch { return null; }   // no model, no claim — never a false refusal

            var forbiddenNamespaces = new List<string>(ForbiddenNamespaces);
            if (channel != null) forbiddenNamespaces.AddRange(channel.Namespaces);
            // The tail of the message must not promise a capability this channel refuses.
            bool filesRefused = forbiddenNamespaces.Contains("System.IO");

            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var node in tree.GetRoot().DescendantNodes())
            {
                // Names only: a type used in `new X()`, a member access, a qualified name.
                // Every capability has to be NAMED before it can be called, so the name is
                // the chokepoint — and it is the one place the compiler can check cheaply.
                if (node is not IdentifierNameSyntax && node is not GenericNameSyntax)
                    continue;

                var symbol = model.GetSymbolInfo(node).Symbol;
                if (symbol == null) continue;

                int line = node.GetLocation().GetLineSpan().StartLinePosition.Line + 1;

                // ── (1) namespace rule — unconditional list plus this channel's ──────
                string? ns = NamespaceOf(symbol);
                if (ns != null && seen.Add(ns))
                {
                    foreach (var forbidden in forbiddenNamespaces)
                    {
                        if (ns.Equals(forbidden, StringComparison.Ordinal) ||
                            ns.StartsWith(forbidden + ".", StringComparison.Ordinal))
                        {
                            return NamespaceRefusal(ns, symbol, line, filesRefused);
                        }
                    }
                }

                if (channel == null) continue;

                // ── (2) type rule — `new Thread(...)`, `AppDomain.CurrentDomain` ─────
                if (symbol is INamedTypeSymbol named)
                {
                    string full = named.ToDisplayString();
                    foreach (var forbiddenType in channel.Types)
                    {
                        if (full.Equals(forbiddenType, StringComparison.Ordinal))
                            return ChannelRefusal(full, symbol, line, channel);
                    }
                }

                // ── (3) member rule — one member of an allowed type ──────────────────
                string? owner = symbol.ContainingType?.ToDisplayString();
                if (owner != null)
                {
                    foreach (var (type, member) in channel.Members)
                    {
                        if (owner.Equals(type, StringComparison.Ordinal) &&
                            symbol.Name.Equals(member, StringComparison.Ordinal))
                        {
                            return ChannelRefusal($"{type}.{symbol.Name}", symbol, line, channel);
                        }
                    }
                }

                // ── (4) Revit FILE primitives — by NAME, on any Autodesk.Revit type ───
                // Owner varies by overload (Document.Export vs ViewSchedule.Export), so this is
                // a name rule scoped to the Revit namespaces rather than a list of owners.
                if (owner != null &&
                    owner.StartsWith("Autodesk.Revit", StringComparison.Ordinal))
                {
                    foreach (var fileMember in channel.RevitFileMembers)
                    {
                        if (symbol.Name.Equals(fileMember, StringComparison.Ordinal))
                        {
                            return RevitFileRefusal($"{owner}.{symbol.Name}", symbol, line, channel);
                        }
                    }
                }
            }
            return null;
        }

        /// <summary>
        /// Compiles <paramref name="script"/> far enough to check it, and throws
        /// <see cref="ScriptSandboxViolation"/> if it names a forbidden capability.
        ///
        /// <para>⚠ Called from <c>ScriptCompiler.CreateScript</c> — the funnel every
        /// agent-authored snippet passes through. The interactive REPL builds its own script and
        /// is checked there too; a third compile site that skips this call is a bypass.</para>
        /// </summary>
        /// <param name="script">The script about to be run.</param>
        /// <param name="channel">
        /// Channel-scoped refusals. <c>ReplSessionManager</c> passes <see cref="ReplChannel"/>
        /// at BOTH of its compile sites; <c>ScriptCompiler</c> passes nothing, so
        /// <c>execute_script</c> keeps the file access a gallery tool needs.
        /// </param>
        public static void ThrowIfForbidden(Script<object> script, ChannelRestrictions? channel = null)
        {
            if (script == null) return;

            Compilation compilation;
            try { compilation = script.GetCompilation(); }
            catch (Exception ex)
            {
                // A snippet that does not compile is the COMPILER's finding to report, with its
                // own diagnostics and line numbers. Swallowing it here would replace a precise
                // CS-error with a vague sandbox message.
                _ = ex;
                return;
            }

            foreach (var tree in compilation.SyntaxTrees)
            {
                var violation = FindForbidden(compilation, tree, channel);
                if (violation != null) throw new ScriptSandboxViolation(violation);
            }
        }

        private static string NamespaceRefusal(string ns, ISymbol symbol, int line, bool filesRefused)
        {
            string tail = filesRefused
                ? "   Everything a Revit task needs is still here: the Revit API, the Paracore\n" +
                  "   extension methods, LINQ, and the model itself. FILE access is not — a\n" +
                  "   file a snippet creates outlives this run, and a .addin planted in the\n" +
                  "   Revit Addins folder is loaded at the next launch with no sandbox at all.\n" +
                  "   Return the data through the tool output instead of writing it to disk.\n" +
                  "   A gallery tool run from the desktop app still has full file access."
                : "   Everything a Revit task needs is still here: the Revit API, the Paracore\n" +
                  "   extension methods, LINQ, System.IO for reading and creating NEW files.";

            return
                $"❌ REFUSED BY THE SCRIPT SANDBOX — `{ns}` is not available to agent code.\n" +
                $"   Reached through: {symbol.ToDisplayString()} (line {line}).\n\n" +
                "   This is not a style rule. The script is compiled with a CLOSED reference\n" +
                "   set, so the process, the network, the registry, native code and the\n" +
                "   reflection family cannot be named at all. If the task genuinely needs one\n" +
                "   of them, it is the user's own action in the REPL or a gallery tool — not\n" +
                "   an agent snippet.\n\n" + tail;
        }

        private static string ChannelRefusal(
            string what, ISymbol symbol, int line, ChannelRestrictions channel)
        {
            return
                $"❌ REFUSED BY THE SCRIPT SANDBOX — `{what}` is not available to agent code\n" +
                $"   on the {channel.Name} channel.\n" +
                $"   Reached through: {symbol.ToDisplayString()} (line {line}).\n\n" +
                "   This is a MACHINE capability, not a Revit one. It is refused because the\n" +
                "   result comes back through tool output to the model provider: reading the\n" +
                "   machine's environment, resolving a type by name at runtime, or terminating\n" +
                "   the host process are all outside what a modelling task needs.\n\n" +
                "   The Revit API, the Paracore extension methods, LINQ and the model itself are\n" +
                "   untouched — edit the model freely. A gallery tool run from the desktop app\n" +
                "   keeps this capability.";
        }

        private static string RevitFileRefusal(
            string what, ISymbol symbol, int line, ChannelRestrictions channel)
        {
            return
                $"❌ REFUSED BY THE SCRIPT SANDBOX — `{what}` is a FILE operation, not a model\n" +
                $"   operation, and it is not available to agent code on the {channel.Name} channel.\n" +
                $"   Reached through: {symbol.ToDisplayString()} (line {line}).\n\n" +
                "   Editing the model is untouched — create walls, set parameters, change views,\n" +
                "   run transactions. What is refused is the family of calls that write or read a\n" +
                "   file at a path you name: SaveAs, Export*, OpenDocumentFile, LoadFamily, Import.\n" +
                "   They bypass System.IO (Revit does the writing), so they would be the one way\n" +
                "   left to put a file anywhere on disk — and a file outlives this run.\n\n" +
                "   What to do instead:\n" +
                "     • return the DATA through Println / Table and let the user decide where it goes;\n" +
                "     • write it yourself with ScriptApi.Files — Files.WriteText(\"takeoff.csv\", csv)\n" +
                "       — which is confined to the workspace folder (Files.Root);\n" +
                "     • for a picture of a view use ExportImage(\"...\") (the engine helper), which\n" +
                "       routes through the same workspace guard.\n" +
                "   Saving the model, or exporting it to a chosen path, is the user's action.";
        }

        private static string? NamespaceOf(ISymbol? symbol)
        {
            if (symbol == null) return null;
            var type = symbol as INamedTypeSymbol ?? symbol.ContainingType;
            return type?.ContainingNamespace?.ToDisplayString();
        }

        // ── the two resolvers ───────────────────────────────────────────────────
        // ⚠ Equals/GetHashCode are part of the contract: ScriptOptions compares resolvers, and
        //   an identity-only implementation makes two identical options look different, which
        //   silently defeats Roslyn's compilation cache.

        private sealed class RefuseReferences : MetadataReferenceResolver
        {
            public override ImmutableArray<PortableExecutableReference> ResolveReference(
                string reference, string? baseFilePath, MetadataReferenceProperties properties)
                => ImmutableArray<PortableExecutableReference>.Empty;

            public override bool Equals(object? other) => other is RefuseReferences;

            public override int GetHashCode() => typeof(RefuseReferences).GetHashCode();
        }

        private sealed class RefuseLoads : SourceReferenceResolver
        {
            public override string? NormalizePath(string path, string? baseFilePath) => path;

            public override string? ResolveReference(string path, string? baseFilePath) => null;

            public override Stream OpenRead(string resolvedPath) =>
                throw new InvalidOperationException(
                    "#load is not available to agent code — a script may not compile another file.");

            public override bool Equals(object? other) => other is RefuseLoads;

            public override int GetHashCode() => typeof(RefuseLoads).GetHashCode();
        }
    }
}
