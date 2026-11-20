using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace CoreScript.Engine.Core
{
    /// <summary>
    /// Compiles caller-supplied C# as a PLAIN .NET class library — the shape Dynamo's
    /// ZeroTouch loader requires — instead of the script-submission assembly that
    /// <see cref="ScriptCompiler.CompileToBytes"/> produces.
    ///
    /// <para>
    /// WHY THIS EXISTS. A gallery script cannot spawn <c>dotnet build</c>:
    /// <c>ScriptSandbox.ThrowIfForbidden</c> refuses <c>System.Diagnostics</c> for every
    /// script, hand-written or generated. But it CAN call a public engine method, and it
    /// CAN write bytes to disk (<c>ScriptApi.Files.WriteBytes</c>). This helper is that
    /// capability: source in, assembly + XML documentation bytes out. The caller decides
    /// where they go.
    /// </para>
    ///
    /// <para>
    /// ⚠ THE DISTINCTION THAT MATTERS. <see cref="ScriptCompiler.CompileToBytes"/> uses
    /// <c>CSharpScript.Create</c> → <c>GetCompilation()</c>, i.e. a SCRIPT. That emits a
    /// submission class and a <c>&lt;Module&gt;</c> wrapper and binds the engine's own
    /// CoreScript/Revit/TakeOff references. Dynamo cannot load that as a ZeroTouch node
    /// library. Here the source is parsed with <see cref="SourceCodeKind.Regular"/> and
    /// emitted with <see cref="OutputKind.DynamicallyLinkedLibrary"/>, against the plain
    /// .NET framework references only (plus any extras the caller passes). The result has
    /// no script wrapper and no Paracore dependency unless the source actually uses one.
    /// </para>
    ///
    /// <para>
    /// This is deliberately a normal public static CLASS, not an extension method and not
    /// a <c>ScriptApi*</c> member: it is host plumbing the script calls by full name, so it
    /// is not part of the documented script-facing surface (<c>EXTENSION_METHODS.md</c>).
    /// </para>
    /// </summary>
    public static class DynamoLibraryCompiler
    {
        /// <summary>Result of a class-library build. Bytes are non-null only on success.</summary>
        public sealed record BuildResult(
            bool Success,
            byte[] Assembly,
            byte[] Documentation,
            string Errors);

        /// <summary>
        /// Compile <paramref name="source"/> as a regular .NET class library.
        /// </summary>
        /// <param name="source">Complete C# source — ordinary classes, not a script.</param>
        /// <param name="assemblyName">Assembly simple name, e.g. <c>Paracore.ParamsNodes</c>.</param>
        /// <param name="extraReferencePaths">
        /// Optional full paths to additional DLLs (e.g. <c>DynamoServices.dll</c> when the
        /// generated nodes use <c>[MultiReturn]</c>). Ignored when null or empty.
        /// </param>
        public static BuildResult Build(
            string source,
            string assemblyName,
            IEnumerable<string>? extraReferencePaths = null)
        {
            if (string.IsNullOrWhiteSpace(source))
                throw new ArgumentException("Source cannot be empty.", nameof(source));
            if (string.IsNullOrWhiteSpace(assemblyName))
                throw new ArgumentException("Assembly name cannot be empty.", nameof(assemblyName));

            var references = new List<MetadataReference>();
            foreach (string path in FrameworkReferencePaths())
            {
                try { references.Add(MetadataReference.CreateFromFile(path)); }
                catch { /* an unreadable framework DLL must not abort the build */ }
            }
            if (extraReferencePaths != null)
            {
                foreach (string path in extraReferencePaths)
                {
                    if (string.IsNullOrWhiteSpace(path) || !File.Exists(path)) continue;
                    try { references.Add(MetadataReference.CreateFromFile(path)); }
                    catch { /* same policy as above */ }
                }
            }

            // DocumentationMode.Parse is what makes Roslyn WRITE the XML sidecar; without it
            // the /// comments are parsed as trivia and the xml stream comes back empty.
            var tree = CSharpSyntaxTree.ParseText(
                source,
                new CSharpParseOptions(LanguageVersion.Latest, DocumentationMode.Parse, SourceCodeKind.Regular),
                path: assemblyName + ".cs");

            var options = new CSharpCompilationOptions(
                OutputKind.DynamicallyLinkedLibrary,
                optimizationLevel: OptimizationLevel.Release,
                deterministic: true,
                allowUnsafe: false);

            var compilation = CSharpCompilation.Create(assemblyName, new[] { tree }, references, options);

            using var assembly = new MemoryStream();
            using var documentation = new MemoryStream();
            var result = compilation.Emit(assembly, xmlDocumentationStream: documentation);

            if (!result.Success)
            {
                string errors = string.Join(Environment.NewLine, result.Diagnostics
                    .Where(d => d.Severity == DiagnosticSeverity.Error)
                    .Select(d => d.ToString()));
                return new BuildResult(false, Array.Empty<byte>(), Array.Empty<byte>(), errors);
            }

            return new BuildResult(true, assembly.ToArray(), documentation.ToArray(), string.Empty);
        }

        /// <summary>
        /// The managed shared-framework references of the running process.
        ///
        /// ⚠ NOT <c>Directory.EnumerateFiles(runtimeDir, "*.dll")</c>. That folder also holds
        /// NATIVE images — <c>coreclr.dll</c>, <c>hostpolicy.dll</c>, <c>msquic.dll</c>,
        /// <c>System.IO.Compression.Native.dll</c> — which Roslyn rejects with CS0009
        /// "PE image doesn't contain managed metadata". Measured, out of process: feeding
        /// the raw folder made the build fail with exactly those six errors.
        /// <c>TRUSTED_PLATFORM_ASSEMBLIES</c> is the host's own list of MANAGED framework
        /// assemblies; it is also what a plain <c>dotnet build</c> compiles against.
        /// </summary>
        private static IEnumerable<string> FrameworkReferencePaths()
        {
            if (AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES") is not string tpa ||
                string.IsNullOrWhiteSpace(tpa))
            {
                // Fallback: the facade set is enough for scalar-only node libraries.
                string? coreLib = typeof(object).Assembly.Location;
                string? dir = string.IsNullOrEmpty(coreLib) ? null : Path.GetDirectoryName(coreLib);
                return dir == null || !Directory.Exists(dir)
                    ? Enumerable.Empty<string>()
                    : new[] { coreLib!, Path.Combine(dir, "System.Runtime.dll") }
                        .Where(File.Exists);
            }

            return tpa.Split(Path.PathSeparator)
                .Where(p => !string.IsNullOrEmpty(p) && File.Exists(p));
        }
    }
}
