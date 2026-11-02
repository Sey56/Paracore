using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// File access for agent-authored scripts, CONFINED to one folder.
    ///
    /// <para><b>Why this exists instead of allowing <c>System.IO</c> (2026-11-01).</b> The REPL
    /// channel refuses <c>System.IO</c> outright, because a file a snippet creates OUTLIVES the
    /// run: a <c>.addin</c> planted in a Revit Addins folder is loaded at the next launch with
    /// no sandbox and no consent. But refusing file access entirely also refuses legitimate
    /// automation — read a schedule, stage a CSV, write a report. The operator's ruling was to
    /// allow file work inside a named folder and refuse it everywhere else.</para>
    ///
    /// <para>⚠⚠ <b>WHY THE BAN IS NOT LIFTED AND CHECKED — the reason this is a façade.</b>
    /// The sandbox is a COMPILE-TIME symbol walk: it sees <c>Path.Combine(root, name)</c> and
    /// knows nothing about the value of <c>name</c>. "Allow <c>System.IO</c> under one root"
    /// is therefore not enforceable at that layer — <c>..\..</c>, a junction, a <c>\\?\</c>
    /// device prefix or an alternate data stream defeats a static check, and what remains is a
    /// boundary that looks real and is not. A path can only be checked where its VALUE exists:
    /// at runtime, on the resolved absolute path. So raw <c>System.IO</c> stays refused, and
    /// every method here funnels through <see cref="Resolve"/> first.</para>
    ///
    /// <para><b>What <see cref="Resolve"/> actually checks</b>, in order: canonicalise (relative
    /// paths resolve against the root), reject device paths, reject alternate data streams,
    /// reject Windows reserved device names, require the result to sit under the root, then walk
    /// every existing segment resolving reparse points and re-check containment after each one.
    /// The last step is the one that matters: a junction INSIDE the workspace pointing at
    /// <c>C:\Windows</c> would pass a prefix test and fail this.</para>
    ///
    /// <para>⚠ <b>What it cannot catch:</b> a hardlink created before the fact, and a file
    /// written by Revit itself (which is why <c>Document.SaveAs</c> and <c>Document.Export*</c>
    /// are refused on this channel). Neither is reachable from script text today.</para>
    /// </summary>
    public static partial class ScriptApi
    {
        /// <summary>
        /// Confined file access. Every path is validated against <see cref="Root"/>.
        /// </summary>
        public static class Files
        {
            private const string RootFolderName = "AgentWorkspace";

            /// <summary>Environment variable that moves the workspace root.</summary>
            public const string RootOverrideVariable = "PARACORE_AGENT_WORKSPACE";

            /// <summary>
            /// The folder agent code may read, write, create and delete in — and the only one.
            ///
            /// <para>Default is <c>%LOCALAPPDATA%\Paracore\AgentWorkspace</c>, chosen because it
            /// is per-user, is not a Revit add-in load path, and is not a system directory.
            /// <c>PARACORE_AGENT_WORKSPACE</c> overrides it for a shop that wants the workspace
            /// on a mapped drive.</para>
            /// </summary>
            public static string Root
            {
                get
                {
                    var configured = ExecutionGlobals.Current.Value?.FileAccessRoot;
                    return Canonical(configured ?? DefaultRoot);
                }
            }

            /// <summary>The default root, before any per-execution override.</summary>
            public static string DefaultRoot
            {
                get
                {
                    var over = Environment.GetEnvironmentVariable(RootOverrideVariable);
                    if (!string.IsNullOrWhiteSpace(over)) return over!;

                    var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                    if (string.IsNullOrWhiteSpace(local)) local = Path.GetTempPath();
                    return Path.Combine(local, "Paracore", RootFolderName);
                }
            }

            /// <summary>
            /// Canonicalises <paramref name="path"/> and proves it is inside <see cref="Root"/>.
            /// <para>Relative paths resolve against the root, so <c>Files.ReadText("out.csv")</c>
            /// means "in the workspace". Every other method calls this first.</para>
            /// </summary>
            /// <exception cref="ArgumentException">The path is blank or malformed.</exception>
            /// <exception cref="UnauthorizedAccessException">The path leaves the root.</exception>
            public static string Resolve(string path)
                => ResolveIn(path, Root, ExecutionGlobals.Current.Value?.ConfineFileAccess ?? false);

            /// <summary>
            /// The guard itself, with the root and the confinement decision supplied EXPLICITLY
            /// instead of read from the ambient execution.
            ///
            /// <para>⚠ Exists so the rule can be PROVEN without a Revit process: the escape
            /// shapes (traversal, junction, device path, data stream, prefix confusion) are pure
            /// path logic, and a test that needs a live document to check them does not get run.
            /// <c>_scratch/filesprobe</c> drives this method directly; the ambient path above is
            /// a two-line delegation, so what is proven here is what ships.</para>
            ///
            /// <para><paramref name="confine"/> = <c>false</c> reproduces the gallery-tool
            /// behaviour (canonicalise, no root check).</para>
            /// </summary>
            public static string ResolveIn(string path, string root, bool confine = true)
            {
                if (string.IsNullOrWhiteSpace(path))
                    throw new ArgumentException("Files: a path is required.", nameof(path));
                if (string.IsNullOrWhiteSpace(root))
                    throw new ArgumentException("Files: a workspace root is required.", nameof(root));

                root = Canonical(root);
                string full;
                try { full = Path.GetFullPath(path, root); }
                catch (Exception ex)
                {
                    throw new ArgumentException($"Files: '{path}' is not a valid path.", nameof(path), ex);
                }

                full = Trim(full);

                // Confinement is per-execution. Gallery tools and the desktop app run with it
                // off and keep the file access they have always had; the REPL channel turns it on.
                if (!confine) return full;

                if (full.StartsWith(@"\\?\", StringComparison.Ordinal) ||
                    full.StartsWith(@"\\.\", StringComparison.Ordinal))
                    throw Refuse(path, full, root, "device paths are not available");

                // Alternate data stream: a colon past the drive letter names a stream on an
                // existing file, which the root check would happily accept.
                int colon = full.IndexOf(':', 2);
                if (colon >= 0)
                    throw Refuse(path, full, root, "alternate data streams are not available");

                RejectReservedNames(full, path, root);

                if (!IsUnder(full, root))
                    throw Refuse(path, full, root, "it is outside the workspace");

                var resolved = ResolveReparsePoints(full, root);
                if (!IsUnder(resolved, root))
                    throw Refuse(path, resolved, root, "a link inside the workspace points outside it");

                return resolved;
            }

            // ── read ────────────────────────────────────────────────────────────────

            /// <summary>True when the file or directory exists inside the root.</summary>
            public static bool Exists(string path) => File.Exists(Resolve(path)) || Directory.Exists(Resolve(path));

            /// <summary>Size in bytes. Throws when the file does not exist.</summary>
            public static long Size(string path) => new FileInfo(Resolve(path)).Length;

            /// <summary>Last write time, UTC.</summary>
            public static DateTime ModifiedUtc(string path) => File.GetLastWriteTimeUtc(Resolve(path));

            /// <summary>Reads a text file as UTF-8.</summary>
            public static string ReadText(string path) => File.ReadAllText(Resolve(path), Encoding.UTF8);

            /// <summary>Reads a text file as lines.</summary>
            public static string[] ReadLines(string path) => File.ReadAllLines(Resolve(path), Encoding.UTF8);

            /// <summary>Reads raw bytes.</summary>
            public static byte[] ReadBytes(string path) => File.ReadAllBytes(Resolve(path));

            // ── write ───────────────────────────────────────────────────────────────

            /// <summary>
            /// Writes text as UTF-8 (no BOM), creating the parent folder. Returns the path
            /// actually written.
            /// </summary>
            public static string WriteText(string path, string text)
            {
                var full = Resolve(path);
                EnsureParent(full);
                File.WriteAllText(full, text ?? string.Empty, new UTF8Encoding(false));
                return full;
            }

            /// <summary>Appends text as UTF-8, creating the file if needed.</summary>
            public static string AppendText(string path, string text)
            {
                var full = Resolve(path);
                EnsureParent(full);
                File.AppendAllText(full, text ?? string.Empty, new UTF8Encoding(false));
                return full;
            }

            /// <summary>Writes lines as UTF-8 (no BOM), creating the parent folder.</summary>
            public static string WriteLines(string path, IEnumerable<string> lines)
            {
                var full = Resolve(path);
                EnsureParent(full);
                File.WriteAllLines(full, lines ?? Array.Empty<string>(), new UTF8Encoding(false));
                return full;
            }

            /// <summary>Writes raw bytes, creating the parent folder.</summary>
            public static string WriteBytes(string path, byte[] bytes)
            {
                var full = Resolve(path);
                EnsureParent(full);
                File.WriteAllBytes(full, bytes ?? Array.Empty<byte>());
                return full;
            }

            // ── enumerate ───────────────────────────────────────────────────────────

            /// <summary>Files in a workspace folder. Absolute paths, sorted by name.</summary>
            public static string[] List(string? directory = null, string pattern = "*")
            {
                var dir = Resolve(string.IsNullOrWhiteSpace(directory) ? "." : directory!);
                if (!Directory.Exists(dir)) return Array.Empty<string>();
                return Directory.GetFiles(dir, pattern)
                                .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
                                .ToArray();
            }

            /// <summary>Sub-folders of a workspace folder. Absolute paths, sorted by name.</summary>
            public static string[] Dirs(string? directory = null)
            {
                var dir = Resolve(string.IsNullOrWhiteSpace(directory) ? "." : directory!);
                if (!Directory.Exists(dir)) return Array.Empty<string>();
                return Directory.GetDirectories(dir)
                                .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
                                .ToArray();
            }

            /// <summary>Creates a folder (and parents). Returns the path created.</summary>
            public static string CreateDirectory(string path)
            {
                var full = Resolve(path);
                Directory.CreateDirectory(full);
                return full;
            }

            // ── move / remove ───────────────────────────────────────────────────────

            /// <summary>Copies a file. Both ends must be inside the root.</summary>
            public static string Copy(string from, string to, bool overwrite = false)
            {
                var src = Resolve(from);
                var dst = Resolve(to);
                EnsureParent(dst);
                File.Copy(src, dst, overwrite);
                return dst;
            }

            /// <summary>Moves a file or folder. Both ends must be inside the root.</summary>
            public static string Move(string from, string to)
            {
                var src = Resolve(from);
                var dst = Resolve(to);
                if (IsRoot(src, Root))
                    throw new UnauthorizedAccessException(
                        $"Files.Move: the workspace root itself cannot be moved. Root: {Root}");
                EnsureParent(dst);
                if (Directory.Exists(src)) Directory.Move(src, dst);
                else File.Move(src, dst);
                return dst;
            }

            /// <summary>
            /// Deletes a file, or a folder that is already EMPTY. Refuses the root itself.
            /// <para>Use <see cref="DeleteDirectory"/> when a non-empty folder must go — the
            /// refusal here is deliberate: "delete" in generated code should not quietly mean
            /// "delete this and everything under it".</para>
            /// </summary>
            public static void Delete(string path)
            {
                var full = Resolve(path);
                if (IsRoot(full, Root))
                    throw new UnauthorizedAccessException(
                        $"Files.Delete: the workspace root itself cannot be deleted. Root: {Root}");

                if (Directory.Exists(full)) Directory.Delete(full, recursive: false);
                else File.Delete(full);
            }

            /// <summary>Deletes a folder and everything under it. Refuses the root itself.</summary>
            public static void DeleteDirectory(string path)
            {
                var full = Resolve(path);
                if (IsRoot(full, Root))
                    throw new UnauthorizedAccessException(
                        $"Files.DeleteDirectory: the workspace root itself cannot be deleted. Root: {Root}");
                if (Directory.Exists(full)) Directory.Delete(full, recursive: true);
            }

            // ── the guard ───────────────────────────────────────────────────────────

            private static string Canonical(string path) => Trim(Path.GetFullPath(path));

            private static string Trim(string full)
            {
                var trimmed = full.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                // Never trim a drive root ("C:\") down to "C:" — that is a RELATIVE path.
                return trimmed.Length == 0 || trimmed.EndsWith(":", StringComparison.Ordinal)
                    ? full
                    : trimmed;
            }

            private static bool IsRoot(string full, string root) =>
                string.Equals(Trim(full), Canonical(root), StringComparison.OrdinalIgnoreCase);

            private static bool IsUnder(string full, string root)
            {
                if (string.Equals(full, root, StringComparison.OrdinalIgnoreCase)) return true;
                return full.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
            }

            /// <summary>
            /// Walks the path from the root, resolving any reparse point it meets and re-checking
            /// containment against the TARGET. A junction inside the workspace aimed at
            /// <c>C:\Windows</c> passes the prefix test and fails here.
            /// </summary>
            private static string ResolveReparsePoints(string full, string root)
            {
                var relative = Path.GetRelativePath(root, full);
                if (relative == ".") return root;

                var segments = relative.Split(
                    new[] { Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar },
                    StringSplitOptions.RemoveEmptyEntries);

                var current = root;
                foreach (var segment in segments)
                {
                    var next = Path.Combine(current, segment);
                    FileSystemInfo info = Directory.Exists(next)
                        ? new DirectoryInfo(next)
                        : new FileInfo(next);

                    var target = info.Exists ? info.ResolveLinkTarget(returnFinalTarget: true) : null;
                    if (target != null)
                    {
                        var resolved = Trim(Path.GetFullPath(target.FullName));
                        if (!IsUnder(resolved, root))
                            throw Refuse(full, resolved, root, "a link inside the workspace points outside it");
                        current = resolved;
                        continue;
                    }
                    current = next;
                }
                return current;
            }

            /// <summary>
            /// Windows device names are not files: <c>CON</c>, <c>NUL</c>, <c>COM1</c> resolve to
            /// devices wherever they appear, and a write to one never touches the disk.
            /// </summary>
            private static void RejectReservedNames(string full, string original, string root)
            {
                foreach (var segment in full.Split(
                             new[] { Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar },
                             StringSplitOptions.RemoveEmptyEntries))
                {
                    var stem = segment.Split('.')[0].TrimEnd(' ');
                    if (ReservedNames.Contains(stem))
                        throw Refuse(original, full, root, $"'{segment}' is a Windows device name");
                }
            }

            private static readonly HashSet<string> ReservedNames =
                new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                {
                    "CON", "PRN", "AUX", "NUL",
                    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
                    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
                };

            private static void EnsureParent(string full)
            {
                var parent = Path.GetDirectoryName(full);
                if (!string.IsNullOrEmpty(parent) && !Directory.Exists(parent))
                    Directory.CreateDirectory(parent);
            }

            private static UnauthorizedAccessException Refuse(
                string requested, string full, string root, string why)
            {
                return new UnauthorizedAccessException(
                    $"❌ REFUSED BY THE SCRIPT SANDBOX — {why}.\n" +
                    $"   Requested: {requested}\n" +
                    $"   Resolved:  {full}\n" +
                    $"   Workspace: {root}\n\n" +
                    "   Agent code may read, write, create and delete files ONLY inside the\n" +
                    "   workspace folder named above. Use Files.Root to build paths, or a path\n" +
                    "   relative to it (Files.WriteText(\"out.csv\", csv) writes into the workspace).\n" +
                    "   `System.IO` is not available on this channel at all — this façade is the\n" +
                    "   door, and it is deliberately the only one.");
            }
        }
    }
}
