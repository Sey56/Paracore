using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.Completion;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Text;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CoreScript.Engine.Core.Rewriters;
using CoreScript.Engine.Globals;
using CoreScript.Engine.Logging;

namespace CoreScript.Engine.Core
{
    /// <summary>
    /// One completion suggestion, in a transport-neutral shape.
    /// <see cref="Kind"/> is a Roslyn tag (<c>Method</c>, <c>Property</c>, <c>Class</c>, …)
    /// that an editor maps to an icon.
    /// </summary>
    /// <param name="Label">The text shown in the completion list.</param>
    /// <param name="InsertText">The text the editor should insert.</param>
    /// <param name="Kind">The Roslyn completion tag.</param>
    /// <param name="Detail">Short inline description, when the provider supplies one.</param>
    /// <param name="SortText">Provider-supplied ordering key.</param>
    public sealed record ReplCompletion(
        string Label,
        string InsertText,
        string Kind,
        string? Detail,
        string SortText);

    /// <summary>
    /// One compiler diagnostic, already mapped into the USER's buffer coordinates and
    /// 1-based, which is what Monaco's marker API expects.
    /// </summary>
    /// <param name="StartLine">1-based line the squiggle starts on.</param>
    /// <param name="StartColumn">1-based column the squiggle starts at.</param>
    /// <param name="EndLine">1-based line the squiggle ends on.</param>
    /// <param name="EndColumn">1-based column the squiggle ends at.</param>
    /// <param name="Message">The compiler's message.</param>
    /// <param name="Severity">Roslyn severity name: <c>Error</c>, <c>Warning</c>, …</param>
    public sealed record ReplDiagnostic(
        int StartLine,
        int StartColumn,
        int EndLine,
        int EndColumn,
        string Message,
        string Severity);

    /// <summary>
    /// What a hover tooltip shows for the symbol under the caret, in a transport-neutral
    /// shape. <see cref="Documentation"/> is the XML <c>&lt;summary&gt;</c> flattened to plain
    /// text and may be empty — most metadata symbols carry no documentation, and an empty
    /// tooltip body is a legitimate answer.
    /// </summary>
    /// <param name="Signature">e.g. <c>IEnumerable&lt;object&gt; GetFinishingTakeoff()</c>.</param>
    /// <param name="Documentation">The summary as plain text, or empty.</param>
    /// <param name="Kind">The Roslyn symbol kind name.</param>
    /// <param name="StartLine">1-based line the highlighted token starts on, in the USER's buffer.</param>
    /// <param name="StartColumn">1-based column.</param>
    /// <param name="EndLine">1-based line the highlighted token ends on.</param>
    /// <param name="EndColumn">1-based column.</param>
    public sealed record ReplHover(
        string Signature,
        string Documentation,
        string Kind,
        int StartLine,
        int StartColumn,
        int EndLine,
        int EndColumn);

    /// <summary>
    /// IntelliSense for the REPL playground, built on Roslyn's <see cref="AdhocWorkspace"/>.
    ///
    /// <para>
    /// THERE IS NO PROJECT ON DISK, and there does not need to be. Roslyn's "workspace" is
    /// an in-memory compilation model: a Project is a list of references plus in-memory
    /// documents, and a Document is just a string. No <c>.csproj</c>, no <c>.sln</c>, no
    /// <c>obj/</c>, no <c>bin/</c>, no MSBuild, no NuGet restore. The REPL stays exactly one
    /// <c>.cs</c> buffer — IntelliSense is an editor-side layer over it and changes nothing
    /// about how the script runs.
    /// </para>
    ///
    /// <para>
    /// The buffer is parsed as a SCRIPT (<see cref="SourceCodeKind.Script"/>), so the
    /// document shape is the one the user actually writes: using directives, then top-level
    /// statements, then class declarations. There is no <c>Params</c> class here — that
    /// belongs to the Gallery's editable-parameter path, not to the REPL.
    /// </para>
    ///
    /// <para>
    /// The preamble below is the SAME one <c>ReplSessionManager</c> prepends, and the
    /// reference and import lists come from <see cref="ScriptReferenceProvider"/> — the one
    /// authority both consumers share. That matters: completion that resolved in a different
    /// context than execution would suggest members the script cannot actually use, which is
    /// worse than suggesting nothing.
    /// </para>
    ///
    /// <para>
    /// ⚠⚠ THREE THINGS MUST MATCH EXECUTION, AND TWO OF THEM ARE INVISIBLE IN THE SOURCE TEXT.
    /// The buffer is a C# <b>script</b>, so the editor must reproduce what
    /// <c>CSharpScript.Create(fullCode, options)</c> does, not merely the same characters:
    /// </para>
    /// <list type="number">
    /// <item>the preamble text (shared with <c>ReplSessionManager</c>);</item>
    /// <item>the <b>script</b> code kind — a script may end on a bare expression with no
    /// semicolon, and its top-level statements need no executable output kind;</item>
    /// <item>the namespace <b>imports</b> — at execution they arrive via
    /// <c>ScriptOptions.WithImports</c>, so they are not visible in the code the user types.</item>
    /// </list>
    /// <para>
    /// Each of 2 and 3 was measured wrong, out of process, and each produced errors for code
    /// that runs fine in the REPL: a regular tree gave
    /// <c>CS8805 "Program using top-level statements must be an executable"</c> plus a demanded
    /// trailing semicolon, and the missing imports gave <c>CS0103</c> for <c>Console</c> and
    /// <c>CS0246</c> for <c>List&lt;&gt;</c> and <c>Wall</c>. With both corrected, this provider
    /// and the execution path report an <b>identical</b> diagnostic set — so the editor can never
    /// disagree with the REPL about what compiles.
    /// </para>
    /// </summary>
    public static class ReplCompletionProvider
    {
        private static readonly object Gate = new();
        private static AdhocWorkspace? _workspace;
        private static DocumentId? _documentId;

        /// <summary>
        /// The preamble the engine prepends to every REPL submission.
        /// Kept in lock-step with <c>ReplSessionManager</c>.
        /// The <c>#line 1 "script"</c> directive re-anchors reported diagnostics to the
        /// user's own line numbers. It is irrelevant to completion — which addresses the
        /// document by absolute character offset, never by line — but it is kept so the two
        /// preambles stay byte-identical and cannot drift apart.
        /// </summary>
        private static string BuildPreamble() =>
            "using static CoreScript.Engine.Globals.ScriptApi;" + ScriptSurface.StaticImportsLine + Environment.NewLine +
            "using Parameter = Autodesk.Revit.DB.Parameter;" + Environment.NewLine +
            "#line 1 \"script\"" + Environment.NewLine;

        /// <summary>
        /// The one long-lived document, whose project carries the expensive metadata
        /// references (RevitAPI.dll alone is ~34 MB). Loading those once is the whole reason
        /// the workspace is cached rather than rebuilt per keystroke.
        /// </summary>
        private static Document GetBaseDocument()
        {
            lock (Gate)
            {
                if (_workspace != null && _documentId != null)
                {
                    return _workspace.CurrentSolution.GetDocument(_documentId)!;
                }

                var workspace = new AdhocWorkspace();

                var references = ScriptReferenceProvider.GetCoreReferences("ReplCompletion")
                    .Concat(ScriptReferenceProvider.GetRevitReferences("ReplCompletion"))
                    .ToList();

                // ⚠⚠ THE NAMESPACE IMPORTS ARE PART OF THE COMPILATION, NOT OF THE SOURCE TEXT.
                // `ReplSessionManager` gets them from `ScriptOptions.WithImports(...)`; a workspace
                // has no such call, so they belong on the compilation options. Without them the
                // buffer reported CS0103 "The name 'Console' does not exist" and CS0246 for
                // `List<>` / `Wall` — for code that runs perfectly in the REPL, because the
                // namespace was imported at execution time and not here. Same list, one authority.
                var imports = ScriptReferenceProvider.GetImports(includeRevitSelection: true);

                var projectInfo = ProjectInfo.Create(
                    ProjectId.CreateNewId(),
                    VersionStamp.Create(),
                    name: "paracore-repl",
                    assemblyName: "paracore-repl",
                    language: LanguageNames.CSharp,
                    compilationOptions: new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary)
                        .WithUsings(imports),
                    parseOptions: new CSharpParseOptions(LanguageVersion.Latest, kind: SourceCodeKind.Script),
                    metadataReferences: references);

                var project = workspace.AddProject(projectInfo);

                // ⚠⚠ THE DOCUMENT'S KIND IS NOT INHERITED FROM THE PROJECT'S PARSE OPTIONS.
                // `workspace.AddDocument(projectId, name, text)` builds a REGULAR document even when
                // the project says `SourceCodeKind.Script` — measured, out of process: the tree came
                // back `Regular`. The buffer was therefore compiled as a top-level-statement PROGRAM,
                // which is why the editor painted the whole playground red with
                // CS8805 "Program using top-level statements must be an executable" and demanded a
                // semicolon on a trailing expression that the REPL happily executes. A script
                // document has to be created explicitly, through `DocumentInfo`.
                var documentInfo = DocumentInfo.Create(
                    DocumentId.CreateNewId(project.Id),
                    "repl.cs",
                    sourceCodeKind: SourceCodeKind.Script,
                    loader: TextLoader.From(TextAndVersion.Create(
                        SourceText.From(string.Empty), VersionStamp.Create())));

                var document = workspace.AddDocument(documentInfo);

                _workspace = workspace;
                _documentId = document.Id;
                return document;
            }
        }

        /// <summary>
        /// Completions at <paramref name="caretOffset"/> in the USER's buffer. The preamble
        /// length is added internally, so a caller never has to know the wrapper exists.
        /// </summary>
        /// <param name="userCode">The raw REPL buffer, exactly as the user typed it.</param>
        /// <param name="caretOffset">Caret position within <paramref name="userCode"/>.</param>
        /// <param name="cancellationToken">Cancels a superseded request (the user typed again).</param>
        public static async Task<IReadOnlyList<ReplCompletion>> GetCompletionsAsync(
            string userCode,
            int caretOffset,
            CancellationToken cancellationToken = default)
        {
            ArgumentNullException.ThrowIfNull(userCode);
            caretOffset = Math.Clamp(caretOffset, 0, userCode.Length);

            try
            {
                string preamble = BuildPreamble();
                Document baseDocument = GetBaseDocument();

                // Fork the solution with the new text rather than mutating the workspace, so
                // two requests in flight cannot corrupt each other's buffer.
                var solution = baseDocument.Project.Solution.WithDocumentText(
                    baseDocument.Id, SourceText.From(preamble + userCode));
                var document = solution.GetDocument(baseDocument.Id)!;

                var service = CompletionService.GetService(document);
                if (service == null)
                {
                    FileLogger.LogWarning(
                        "[ReplCompletion] CompletionService is unavailable — the Roslyn MEF host did not compose.");
                    return Array.Empty<ReplCompletion>();
                }

                var completions = await service
                    .GetCompletionsAsync(document, preamble.Length + caretOffset, cancellationToken: cancellationToken)
                    .ConfigureAwait(false);

                if (completions == null)
                {
                    return Array.Empty<ReplCompletion>();
                }

                return completions.ItemsList
                    .Select(item => new ReplCompletion(
                        item.DisplayText,
                        item.FilterText,
                        item.Tags.Length > 0 ? item.Tags[0] : "Text",
                        item.InlineDescription,
                        item.SortText))
                    .ToList();
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                // An editor convenience must never break its caller: an empty list is a valid
                // answer, a thrown exception is not.
                FileLogger.LogWarning($"[ReplCompletion] Completion failed: {ex.GetType().Name}: {ex.Message}");
                return Array.Empty<ReplCompletion>();
            }
        }

        /// <summary>
        /// Compiler diagnostics for the USER's buffer, in the buffer's own coordinates.
        ///
        /// ⚠ Line numbers are mapped back through the preamble. Roslyn reports positions in
        /// the WRAPPED document (preamble + code); the editor needs positions in the buffer
        /// the user actually sees. The preamble ends with a newline, so the user's first line
        /// is a whole line of its own — the mapping is line arithmetic, with no column shift.
        ///
        /// Only warnings and errors are returned: info/hidden diagnostics are noise in an
        /// editor that is trying to teach.
        /// </summary>
        public static async Task<IReadOnlyList<ReplDiagnostic>> GetDiagnosticsAsync(
            string userCode,
            CancellationToken cancellationToken = default)
        {
            ArgumentNullException.ThrowIfNull(userCode);

            try
            {
                string preamble = BuildPreamble();
                int preambleLines = preamble.Count(c => c == '\n');
                Document baseDocument = GetBaseDocument();

                var solution = baseDocument.Project.Solution.WithDocumentText(
                    baseDocument.Id, SourceText.From(preamble + userCode));
                var document = solution.GetDocument(baseDocument.Id)!;

                var compilation = await document.Project
                    .GetCompilationAsync(cancellationToken)
                    .ConfigureAwait(false);
                if (compilation == null)
                {
                    return Array.Empty<ReplDiagnostic>();
                }

                var results = new List<ReplDiagnostic>();
                foreach (var diagnostic in compilation.GetDiagnostics(cancellationToken))
                {
                    if (diagnostic.Severity < DiagnosticSeverity.Warning)
                    {
                        continue;
                    }
                    if (!diagnostic.Location.IsInSource)
                    {
                        continue;
                    }

                    var span = diagnostic.Location.GetLineSpan();
                    int startLine = span.StartLinePosition.Line - preambleLines;

                    // A diagnostic that STARTS inside the preamble is ours, not the user's —
                    // dropping it is what keeps our own scaffolding out of the editor.
                    if (startLine < 0)
                    {
                        continue;
                    }

                    int endLine = Math.Max(span.EndLinePosition.Line - preambleLines, startLine);

                    results.Add(new ReplDiagnostic(
                        startLine + 1,
                        span.StartLinePosition.Character + 1,
                        endLine + 1,
                        span.EndLinePosition.Character + 1,
                        diagnostic.GetMessage(),
                        diagnostic.Severity.ToString()));
                }

                return results;
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                // Same contract as completion: an editor convenience degrades to "nothing to
                // show", never to a thrown exception.
                FileLogger.LogWarning($"[ReplCompletion] Diagnostics failed: {ex.GetType().Name}: {ex.Message}");
                return Array.Empty<ReplDiagnostic>();
            }
        }

        /// <summary>
        /// How a hovered symbol is rendered: a signature a C# developer would recognise —
        /// return type, name, parameter types and names — with special types spelled the C#
        /// way (<c>int</c>, not <c>System.Int32</c>) and namespaces left off.
        /// </summary>
        private static readonly SymbolDisplayFormat HoverSignatureFormat = new(
            globalNamespaceStyle: SymbolDisplayGlobalNamespaceStyle.Omitted,
            typeQualificationStyle: SymbolDisplayTypeQualificationStyle.NameOnly,
            genericsOptions: SymbolDisplayGenericsOptions.IncludeTypeParameters,
            memberOptions:
                SymbolDisplayMemberOptions.IncludeParameters |
                SymbolDisplayMemberOptions.IncludeType |
                SymbolDisplayMemberOptions.IncludeRef |
                SymbolDisplayMemberOptions.IncludeContainingType,
            parameterOptions:
                SymbolDisplayParameterOptions.IncludeType |
                SymbolDisplayParameterOptions.IncludeName |
                SymbolDisplayParameterOptions.IncludeParamsRefOut |
                SymbolDisplayParameterOptions.IncludeDefaultValue,
            propertyStyle: SymbolDisplayPropertyStyle.ShowReadWriteDescriptor,
            miscellaneousOptions:
                SymbolDisplayMiscellaneousOptions.EscapeKeywordIdentifiers |
                SymbolDisplayMiscellaneousOptions.UseSpecialTypes);

        /// <summary>
        /// Hover for the symbol at <paramref name="caretOffset"/> in the USER's buffer, or
        /// <c>null</c> when there is nothing to say (whitespace, punctuation, an unresolved
        /// name). "Nothing here" is an answer, not a failure — hence null, not an exception.
        /// </summary>
        /// <param name="userCode">The raw REPL buffer, exactly as the user typed it.</param>
        /// <param name="caretOffset">Caret position within <paramref name="userCode"/>.</param>
        /// <param name="cancellationToken">Cancels a superseded request (the user moved on).</param>
        public static async Task<ReplHover?> GetHoverAsync(
            string userCode,
            int caretOffset,
            CancellationToken cancellationToken = default)
        {
            ArgumentNullException.ThrowIfNull(userCode);
            caretOffset = Math.Clamp(caretOffset, 0, userCode.Length);

            try
            {
                string preamble = BuildPreamble();
                int preambleLines = preamble.Count(c => c == '\n');
                Document baseDocument = GetBaseDocument();

                var solution = baseDocument.Project.Solution.WithDocumentText(
                    baseDocument.Id, SourceText.From(preamble + userCode));
                var document = solution.GetDocument(baseDocument.Id)!;

                var root = await document.GetSyntaxRootAsync(cancellationToken).ConfigureAwait(false);
                var model = await document.GetSemanticModelAsync(cancellationToken).ConfigureAwait(false);
                if (root == null || model == null)
                {
                    return null;
                }

                int absolute = preamble.Length + caretOffset;
                if (absolute < 0 || absolute > root.FullSpan.End)
                {
                    return null;
                }

                // A caret sits BETWEEN two characters, so "the token containing the caret" is
                // ambiguous at a word's right-hand edge. Try the position itself, then the
                // character before it: hovering the final letter of an identifier must not
                // resolve to the end-of-file token and give up.
                SyntaxNode? node = null;
                SyntaxToken token = default;
                foreach (int probe in new[] { absolute, absolute - 1 })
                {
                    if (probe < preamble.Length || probe > root.FullSpan.End)
                    {
                        continue;
                    }

                    var candidate = root.FindToken(probe);
                    if (candidate.IsKind(SyntaxKind.EndOfFileToken) || candidate.Span.IsEmpty)
                    {
                        continue;
                    }

                    node = candidate.Parent;
                    if (node != null)
                    {
                        token = candidate;
                        break;
                    }
                }

                if (node == null)
                {
                    return null;
                }

                ISymbol? symbol = model.GetSymbolInfo(node, cancellationToken).Symbol;

                // The token's immediate parent is often not the node the binder resolves, so
                // walk outwards until something answers.
                if (symbol == null)
                {
                    foreach (SyntaxNode ancestor in node.AncestorsAndSelf())
                    {
                        symbol = model.GetSymbolInfo(ancestor, cancellationToken).Symbol;
                        if (symbol != null)
                        {
                            break;
                        }
                    }
                }

                // A declaration rather than a use (`class Foo`, `var x`) still deserves a tooltip.
                symbol ??= model.GetDeclaredSymbol(node, cancellationToken);
                symbol = NormalizeForHover(symbol);
                if (symbol == null)
                {
                    return null;
                }

                // Highlight the symbol's own declaration when it lives in this buffer; a
                // metadata symbol (Revit's `Wall`, a pack's method) has no location here, so
                // fall back to the token under the caret.
                TextSpan highlight = symbol.Locations
                    .FirstOrDefault(l => l.IsInSource && l.SourceTree == root.SyntaxTree)
                    ?.SourceSpan ?? token.Span;

                var lineSpan = root.SyntaxTree.GetLineSpan(highlight);
                int startLine = lineSpan.StartLinePosition.Line - preambleLines;
                int endLine = lineSpan.EndLinePosition.Line - preambleLines;
                if (startLine < 0)
                {
                    return null;   // the symbol is ours (declared in the preamble), not the user's
                }

                return new ReplHover(
                    symbol.ToDisplayString(HoverSignatureFormat),
                    ExtractSummary(symbol),
                    symbol.Kind.ToString(),
                    startLine + 1,
                    lineSpan.StartLinePosition.Character + 1,
                    Math.Max(endLine, startLine) + 1,
                    lineSpan.EndLinePosition.Character + 1);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                // Same contract as completion and diagnostics: an editor convenience degrades
                // to "nothing to show", never to a thrown exception.
                FileLogger.LogWarning($"[ReplHover] Hover failed: {ex.GetType().Name}: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// The symbol a tooltip should describe. A reduced extension method hides its
        /// <c>this</c> parameter, so the reduced form would render `GetStr(string)` instead of
        /// the callable `GetStr(this Element, string)`; and an alias such as
        /// <c>using Parameter = Autodesk.Revit.DB.Parameter</c> is better described by the type
        /// it aliases than by the alias name.
        /// </summary>
        private static ISymbol? NormalizeForHover(ISymbol? symbol) => symbol switch
        {
            null => null,
            IMethodSymbol { ReducedFrom: not null } method => method.ReducedFrom,
            IAliasSymbol alias => alias.Target,
            _ => symbol,
        };

        /// <summary>
        /// The XML <c>&lt;summary&gt;</c> of a symbol's documentation comment, flattened to one
        /// line of plain text. Empty when the symbol is undocumented — the common case for a
        /// type arriving from a referenced assembly that ships no XML file beside it.
        /// </summary>
        private static string ExtractSummary(ISymbol symbol)
        {
            string xml = symbol.GetDocumentationCommentXml(expandIncludes: true, cancellationToken: default);
            if (string.IsNullOrWhiteSpace(xml))
            {
                return string.Empty;
            }

            try
            {
                var element = System.Xml.Linq.XElement.Parse(xml.Trim());
                var summary = element.Element("summary");
                return CollapseWhitespace(summary != null ? summary.Value : element.Value);
            }
            catch
            {
                // A malformed doc comment must not cost the user the signature as well.
                return string.Empty;
            }
        }

        /// <summary>
        /// Squashes the newlines and indentation of an XML doc comment into single spaces, so
        /// the tooltip reads as one paragraph instead of reproducing the source file's breaks.
        /// </summary>
        private static string CollapseWhitespace(string text)
        {
            var builder = new System.Text.StringBuilder(text.Length);
            bool pendingSpace = false;
            foreach (char c in text)
            {
                if (char.IsWhiteSpace(c))
                {
                    pendingSpace = builder.Length > 0;
                    continue;
                }

                if (pendingSpace)
                {
                    builder.Append(' ');
                    pendingSpace = false;
                }

                builder.Append(c);
            }

            return builder.ToString();
        }

        /// <summary>
        /// Drops the cached compilation so the next request rebuilds it. Call when the Revit
        /// document changes, or after a pack registers a new script surface.
        /// </summary>
        public static void Reset()
        {
            lock (Gate)
            {
                _workspace?.Dispose();
                _workspace = null;
                _documentId = null;
            }
        }
    }
}
