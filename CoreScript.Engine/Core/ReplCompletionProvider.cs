using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.Completion;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
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
    /// A completion answer together with the exact replacement span it applies to.
    /// The span is in UTF-16 offsets of the USER buffer (preamble excluded) and is
    /// derived from Roslyn's own syntax tree. The editor must use it verbatim: a
    /// client-side guess of the same span has repeatedly proven wrong inside
    /// interpolated strings, where a line scan cannot tell C# code from a DSL string.
    /// </summary>
    /// <param name="Items">The suggestions to display.</param>
    /// <param name="RangeStart">Inclusive start offset in the user buffer.</param>
    /// <param name="RangeEnd">Exclusive end offset in the user buffer.</param>
    public sealed record ReplCompletionSet(
        IReadOnlyList<ReplCompletion> Items,
        int RangeStart,
        int RangeEnd);

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
            => (await GetCompletionSetAsync(userCode, caretOffset, null, cancellationToken)
                .ConfigureAwait(false)).Items;

        /// <summary>
        /// Same, plus an optional host-supplied catalog for document-specific parameter names.
        /// Category names need no catalog: they are <c>BuiltInCategory</c> members and are
        /// derived here without touching the Revit document.
        /// </summary>
        public static async Task<IReadOnlyList<ReplCompletion>> GetCompletionsAsync(
            string userCode,
            int caretOffset,
            IReplCompletionCatalog? catalog,
            CancellationToken cancellationToken = default)
            => (await GetCompletionSetAsync(userCode, caretOffset, catalog, cancellationToken)
                .ConfigureAwait(false)).Items;

        /// <summary>
        /// The authoritative answer: suggestions AND the exact span they replace, both in
        /// USER-buffer coordinates. Editors must use the span verbatim; deriving it again in
        /// the client has caused silent "no completions" inside interpolated strings.
        /// </summary>
        public static async Task<ReplCompletionSet> GetCompletionSetAsync(
            string userCode,
            int caretOffset,
            IReplCompletionCatalog? catalog = null,
            CancellationToken cancellationToken = default)
        {
            ArgumentNullException.ThrowIfNull(userCode);
            caretOffset = Math.Clamp(caretOffset, 0, userCode.Length);

            int rangeStart = caretOffset;
            int rangeEnd = caretOffset;

            try
            {
                string preamble = BuildPreamble();
                Document baseDocument = GetBaseDocument();
                int wrappedCaret = preamble.Length + caretOffset;

                // Fork the solution with the new text rather than mutating the workspace, so
                // two requests in flight cannot corrupt each other's buffer.
                var solution = baseDocument.Project.Solution.WithDocumentText(
                    baseDocument.Id, SourceText.From(preamble + userCode));
                var document = solution.GetDocument(baseDocument.Id)!;

                // ⚠ Roslyn cannot complete a string literal. In this DSL the literal IS the
                //   API: `GetElements("Walls")` and `.WhereParam("Height", …)`. Detect that
                //   context syntactically and answer from Revit's own catalogs instead of
                //   returning the empty list a C# compiler would give.
                SyntaxNode? root = await document.GetSyntaxRootAsync(cancellationToken).ConfigureAwait(false);
                StringArgumentContext stringContext = StringArgumentContext.None;
                if (root != null)
                {
                    stringContext = DetectStringArgument(root, wrappedCaret, out string? hint);
                    (rangeStart, rangeEnd) = ComputeReplacementRange(
                        root, wrappedCaret, stringContext, preamble.Length, userCode.Length);

                    if (stringContext != StringArgumentContext.None)
                    {
                        if (stringContext == StringArgumentContext.Category)
                        {
                            IReadOnlyList<ReplCompletion> categories = catalog == null
                                ? Array.Empty<ReplCompletion>()
                                : await catalog.GetCategoryCompletionsAsync(cancellationToken).ConfigureAwait(false);
                            return new ReplCompletionSet(
                                categories.Count > 0 ? categories : CommonCategoryCompletions(),
                                rangeStart, rangeEnd);
                        }

                        // The hint is passed through as typed. The host normalizes it
                        // against BuiltInCategory, exactly as GetElements does at runtime.
                        // ⚠ Do NOT substitute a generic list when a Revit catalog exists:
                        // "Height" is not a Wall parameter — the real name is "Unconnected
                        // Height". A wrong parameter name is worse than no suggestion.
                        if (catalog == null)
                        {
                            // No Revit host (e.g. a future non-Revit editor): the generic
                            // fallback is all we can honestly offer.
                            return new ReplCompletionSet(CommonParameterCompletions(), rangeStart, rangeEnd);
                        }

                        if (!string.IsNullOrWhiteSpace(hint))
                        {
                            IReadOnlyList<ReplCompletion> found =
                                await catalog.GetParameterCompletionsAsync(hint, cancellationToken)
                                    .ConfigureAwait(false);
                            if (found.Count > 0)
                                return new ReplCompletionSet(found, rangeStart, rangeEnd);

                            FileLogger.LogWarning(
                                $"[ReplCompletion] No parameter names from host catalog for '{hint}'.");
                        }
                        else
                        {
                            FileLogger.LogWarning(
                                "[ReplCompletion] Parameter context detected, but no category could be inferred from the buffer.");
                        }

                        // A real Revit catalog is present: never guess. An empty answer is
                        // honest; `.CombinedParams().Table()` is the discovery route.
                        return new ReplCompletionSet(Array.Empty<ReplCompletion>(), rangeStart, rangeEnd);
                    }
                }

                var service = CompletionService.GetService(document);
                if (service == null)
                {
                    FileLogger.LogWarning(
                        "[ReplCompletion] CompletionService is unavailable — the Roslyn MEF host did not compose.");
                    return new ReplCompletionSet(Array.Empty<ReplCompletion>(), rangeStart, rangeEnd);
                }

                var completions = await service
                    .GetCompletionsAsync(document, wrappedCaret, cancellationToken: cancellationToken)
                    .ConfigureAwait(false);

                if (completions == null)
                    return new ReplCompletionSet(Array.Empty<ReplCompletion>(), rangeStart, rangeEnd);

                var items = completions.ItemsList
                    .Select(item => new ReplCompletion(
                        item.DisplayText,
                        item.FilterText,
                        item.Tags.Length > 0 ? item.Tags[0] : "Text",
                        item.InlineDescription,
                        item.SortText))
                    .ToList();

                return new ReplCompletionSet(items, rangeStart, rangeEnd);
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
                return new ReplCompletionSet(Array.Empty<ReplCompletion>(), rangeStart, rangeEnd);
            }
        }

        /// <summary>
        /// Derives the replacement span from Roslyn's OWN syntax tree. This is the single
        /// authority: the editor must not re-derive it with a line scan. In particular a
        /// caret inside an interpolated string's {...} still resolves to the C# identifier
        /// token, whereas a naive "inside a string" test would hand Monaco `{wall.` and
        /// cause every member label to be filtered away.
        /// </summary>
        private static (int Start, int End) ComputeReplacementRange(
            SyntaxNode root,
            int wrappedCaret,
            StringArgumentContext stringContext,
            int preambleLength,
            int userLength)
        {
            int ToUser(int wrapped) => Math.Clamp(wrapped - preambleLength, 0, userLength);
            int probe = Math.Clamp(wrappedCaret - 1, 0, Math.Max(root.FullSpan.Length - 1, 0));
            SyntaxToken token = root.FindToken(probe);

            // DSL string argument: replace the CONTENT, not the quotes. A still-open
            // literal has no closing quote yet, so do not shave its last typed character.
            if (stringContext != StringArgumentContext.None &&
                token.Parent is LiteralExpressionSyntax literal)
            {
                string text = token.Text;
                int openSkip = text.StartsWith("@\"", StringComparison.Ordinal) ? 2 : 1;
                int closeSkip = text.EndsWith("\"", StringComparison.Ordinal) ? 1 : 0;
                int start = ToUser(literal.SpanStart + openSkip);
                int end = ToUser(literal.Span.End - closeSkip);
                if (end >= start) return (start, end);
            }

            // Normal C# (including {...} in an interpolated string): replace the word
            // being typed. After a '.' the token is the dot, so use a zero-width span.
            if (token.IsKind(SyntaxKind.IdentifierToken) &&
                token.SpanStart <= wrappedCaret && wrappedCaret <= token.Span.End)
            {
                return (ToUser(token.SpanStart), ToUser(token.Span.End));
            }

            int at = ToUser(wrappedCaret);
            return (at, at);
        }

        // ── String-literal completion ────────────────────────────────────────────────
        // The names in these strings are NOT free text:
        //   • GetElements("Walls")  -> BuiltInCategory.OST_Walls with OST_ stripped;
        //   • .WhereParam("Height") -> a real parameter of the collection's category.
        // Both are finite, model-backed sets, so they belong in IntelliSense.

        private enum StringArgumentContext { None, Category, Parameter }

        private static readonly HashSet<string> ParameterStringMethods = new(StringComparer.Ordinal)
        {
            "WhereParam", "WhereTypeParam", "GetStr", "GetNum", "GetInt",
            "GetVal", "GetTypeStr", "GetTypeNum", "GetTypeInt", "GetTypeVal",
            "SetVal", "SetStr",
            "SetNum", "SetInt", "GroupByParam", "SumParam", "AvgParam"
        };

        private static StringArgumentContext DetectStringArgument(
            SyntaxNode root, int position, out string? categoryHint)
        {
            categoryHint = null;
            int probe = Math.Clamp(position - 1, 0, Math.Max(root.FullSpan.Length - 1, 0));
            SyntaxToken token = root.FindToken(probe);
            if (!token.IsKind(SyntaxKind.StringLiteralToken)) return StringArgumentContext.None;
            if (token.Parent is not LiteralExpressionSyntax literal) return StringArgumentContext.None;
            if (literal.Parent is not ArgumentSyntax argument) return StringArgumentContext.None;
            if (argument.Parent is not ArgumentListSyntax argList) return StringArgumentContext.None;
            if (argList.Parent is not InvocationExpressionSyntax invocation) return StringArgumentContext.None;

            // SimpleNameSyntax covers BOTH `GetElements("Walls")` (IdentifierNameSyntax)
            // and `GetElements<FamilyInstance>("Doors")` (GenericNameSyntax). The old
            // switch handled only the first, so NO string completion — categories or
            // parameters — ever fired for the typed spelling, which is the one loadable
            // families require.
            string method = invocation.Expression switch
            {
                SimpleNameSyntax name => name.Identifier.ValueText,
                MemberAccessExpressionSyntax ma => ma.Name.Identifier.ValueText,
                MemberBindingExpressionSyntax mb => mb.Name.Identifier.ValueText,
                _ => string.Empty,
            };

            if (method == "GetElements") return StringArgumentContext.Category;
            if (!ParameterStringMethods.Contains(method)) return StringArgumentContext.None;

            categoryHint = FindCategoryHint(root, invocation);
            return StringArgumentContext.Parameter;
        }

        /// <summary>
        /// Resolves the category behind the collection being filtered. Handles all of these:
        ///   • GetElements("Walls").WhereParam(...)
        ///   • GetElements&lt;Wall&gt;().WhereParam(...)
        ///   • var walls = GetElements&lt;Wall&gt;(); walls.WhereParam(...)
        ///   • GetElements("Walls").Cast&lt;Wall&gt;().WhereParam(...)
        /// A nearest-prior GetElements call remains as a last resort, but the receiver chain
        /// is resolved first so two different collections in one buffer do not cross-talk.
        /// </summary>
        private static string? FindCategoryHint(SyntaxNode root, InvocationExpressionSyntax current)
        {
            ExpressionSyntax? receiver = current.Expression switch
            {
                MemberAccessExpressionSyntax ma => ma.Expression,
                MemberBindingExpressionSyntax =>
                    (current.Parent as ConditionalAccessExpressionSyntax)?.Expression,
                _ => null,
            };

            string? hint = ResolveCollectionHint(root, receiver, new HashSet<SyntaxNode>());
            if (!string.IsNullOrWhiteSpace(hint)) return hint;

            // Last resort: nearest preceding GetElements call with an extractable hint.
            int bestStart = -1;
            foreach (InvocationExpressionSyntax call in root.DescendantNodes().OfType<InvocationExpressionSyntax>())
            {
                if (ReferenceEquals(call, current)) continue;
                if (call.SpanStart > current.SpanStart) continue;
                string? candidate = ExtractGetElementsHint(call);
                if (!string.IsNullOrWhiteSpace(candidate) && call.SpanStart > bestStart)
                {
                    hint = candidate;
                    bestStart = call.SpanStart;
                }
            }
            return hint;
        }

        /// <summary>
        /// Walk the receiver of the filtered call back to a GetElements invocation, including
        /// local variables and chained pipeline calls. The visited set prevents a malformed
        /// buffer from looping forever.
        /// </summary>
        private static string? ResolveCollectionHint(
            SyntaxNode root,
            ExpressionSyntax? expression,
            HashSet<SyntaxNode> visited)
        {
            switch (expression)
            {
                case null:
                    return null;

                case IdentifierNameSyntax id when id.Identifier.ValueText == "Element":
                    // GetElements<Element>() is deliberately universal — there is no single
                    // category whose parameter list would be correct.
                    return null;

                case ParenthesizedExpressionSyntax paren:
                    return ResolveCollectionHint(root, paren.Expression, visited);

                case InvocationExpressionSyntax invocation:
                {
                    string? direct = ExtractGetElementsHint(invocation);
                    if (!string.IsNullOrWhiteSpace(direct)) return direct;

                    // A FilteredElementCollector chain names its category through
                    // OfClass(typeof(Wall)) / Cast<Wall>() rather than a string.
                    string? viaChain = ExtractCategoryFromChainCall(invocation);
                    if (!string.IsNullOrWhiteSpace(viaChain)) return viaChain;

                    // A chained call such as .Cast<Wall>() or .Where(...) keeps the original
                    // collection as its receiver, so walk one level back.
                    ExpressionSyntax? inner = invocation.Expression switch
                    {
                        MemberAccessExpressionSyntax ma => ma.Expression,
                        MemberBindingExpressionSyntax =>
                            (invocation.Parent as ConditionalAccessExpressionSyntax)?.Expression,
                        _ => null,
                    };
                    return visited.Add(invocation)
                        ? ResolveCollectionHint(root, inner, visited)
                        : null;
                }

                case MemberAccessExpressionSyntax ma:
                    return ResolveCollectionHint(root, ma.Expression, visited);

                case IdentifierNameSyntax id:
                {
                    if (!visited.Add(id)) return null;

                    // Nearest assignment or declaration of this local before the call.
                    ExpressionSyntax? initializer = null;
                    int bestStart = -1;
                    foreach (VariableDeclaratorSyntax declarator in
                             root.DescendantNodes().OfType<VariableDeclaratorSyntax>())
                    {
                        if (declarator.SpanStart > id.SpanStart) continue;
                        if (!string.Equals(declarator.Identifier.ValueText, id.Identifier.ValueText,
                                           StringComparison.Ordinal)) continue;
                        if (declarator.Initializer?.Value == null) continue;
                        if (declarator.SpanStart > bestStart)
                        {
                            initializer = declarator.Initializer.Value;
                            bestStart = declarator.SpanStart;
                        }
                    }
                    // A foreach loop variable takes its collection from the `in` clause:
                    //   foreach (Wall wall in walls) { wall.GetNum("...") }
                    // Without this the receiver is a bare identifier with no declaration
                    // or assignment, so no category could be inferred and string
                    // completion returned nothing.
                    foreach (ForEachStatementSyntax loop in
                             root.DescendantNodes().OfType<ForEachStatementSyntax>())
                    {
                        if (loop.SpanStart > id.SpanStart) continue;
                        if (!string.Equals(loop.Identifier.ValueText, id.Identifier.ValueText,
                                           StringComparison.Ordinal)) continue;
                        if (loop.SpanStart <= bestStart) continue;
                        initializer = loop.Expression;
                        bestStart = loop.SpanStart;
                    }

                    foreach (AssignmentExpressionSyntax assignment in
                             root.DescendantNodes().OfType<AssignmentExpressionSyntax>())
                    {
                        if (assignment.SpanStart > id.SpanStart) continue;
                        if (assignment.Left is not IdentifierNameSyntax left ||
                            !string.Equals(left.Identifier.ValueText, id.Identifier.ValueText,
                                           StringComparison.Ordinal)) continue;
                        if (assignment.SpanStart > bestStart)
                        {
                            initializer = assignment.Right;
                            bestStart = assignment.SpanStart;
                        }
                    }
                    return ResolveCollectionHint(root, initializer, visited);
                }

                default:
                    return null;
            }
        }

        private static string? ExtractGetElementsHint(InvocationExpressionSyntax call)
        {
            string method = call.Expression switch
            {
                SimpleNameSyntax name => name.Identifier.ValueText,
                MemberAccessExpressionSyntax ma => ma.Name.Identifier.ValueText,
                _ => string.Empty,
            };
            if (!string.Equals(method, "GetElements", StringComparison.Ordinal)) return null;

            ExpressionSyntax? first = call.ArgumentList.Arguments.FirstOrDefault()?.Expression;
            if (first is LiteralExpressionSyntax literal)
            {
                string value = literal.Token.ValueText;
                if (!string.IsNullOrWhiteSpace(value)) return value;
            }

            // GetElements<Wall>() has no string argument. Map the concrete element class to
            // the category whose parameters the host catalog can enumerate.
            if (call.Expression is GenericNameSyntax generic &&
                generic.TypeArgumentList.Arguments.Count == 1)
            {
                string typeName = generic.TypeArgumentList.Arguments[0].ToString();
                int dot = typeName.LastIndexOf('.');
                if (dot >= 0) typeName = typeName.Substring(dot + 1);
                return ElementTypeToCategory.TryGetValue(typeName, out string? category)
                    ? category
                    : null;
            }

            return null;
        }

        /// <summary>
        /// The other common collection shape:
        ///   new FilteredElementCollector(Doc).OfClass(typeof(Wall)).Cast<Wall>().ToList()
        /// No GetElements string exists, but typeof(Wall), Cast&lt;Wall&gt;() and
        /// OfCategory(BuiltInCategory.OST_Walls) all name the category unambiguously.
        /// </summary>
        private static string? ExtractCategoryFromChainCall(InvocationExpressionSyntax call)
        {
            string method = call.Expression switch
            {
                SimpleNameSyntax name => name.Identifier.ValueText,
                MemberAccessExpressionSyntax ma => ma.Name.Identifier.ValueText,
                _ => string.Empty,
            };

            if ((method == "OfClass" || method == "OfCategory") &&
                call.ArgumentList.Arguments.Count > 0)
            {
                ExpressionSyntax first = call.ArgumentList.Arguments[0].Expression;
                if (first is TypeOfExpressionSyntax typeOf &&
                    TryMapElementType(typeOf.Type.ToString(), out string? mapped))
                    return mapped;
                if (first is MemberAccessExpressionSyntax enumValue)
                {
                    string name = enumValue.Name.Identifier.ValueText;
                    if (name.StartsWith("OST_", StringComparison.OrdinalIgnoreCase))
                        return name.Substring(4);
                }
            }

            if (call.Expression is GenericNameSyntax generic &&
                generic.TypeArgumentList.Arguments.Count == 1 &&
                TryMapElementType(generic.TypeArgumentList.Arguments[0].ToString(), out string? viaGeneric))
                return viaGeneric;

            return null;
        }

        private static bool TryMapElementType(string name, out string? category)
        {
            int dot = name.LastIndexOf('.');
            string simple = dot >= 0 ? name.Substring(dot + 1) : name;
            return ElementTypeToCategory.TryGetValue(simple, out category);
        }

        /// <summary>
        /// System families need no category string, so GetElements&lt;Wall&gt;() cannot be
        /// inferred from syntax alone. This is the small, stable set of Revit element classes
        /// whose category is unambiguous. Loadable families must still spell the category:
        /// GetElements&lt;FamilyInstance&gt;("Doors").
        /// </summary>
        private static readonly Dictionary<string, string> ElementTypeToCategory =
            new(StringComparer.OrdinalIgnoreCase)
            {
                ["Wall"] = "Walls",
                ["WallType"] = "Walls",
                ["Floor"] = "Floors",
                ["FloorType"] = "Floors",
                ["Roof"] = "Roofs",
                ["RoofBase"] = "Roofs",
                ["RoofType"] = "Roofs",
                ["Ceiling"] = "Ceilings",
                ["CeilingType"] = "Ceilings",
                ["Room"] = "Rooms",
                ["Level"] = "Levels",
                ["Grid"] = "Grids",
                ["Area"] = "Areas",
                ["Space"] = "Spaces",
                ["PropertyLine"] = "Property Lines",
                ["View"] = "Views",
                ["Sheet"] = "Sheets",
            };

        /// <summary>
        /// Deprecated-leaning fallback used only when the host supplies no catalog —
        /// for instance a future non-Revit editor. The real list comes from the host's
        /// BuiltInCategory enumeration, so it matches this Revit version exactly.
        /// </summary>
        private static IReadOnlyList<ReplCompletion> CommonCategoryCompletions() =>
            new[]
            {
                "Walls", "Doors", "Windows", "Floors", "Ceilings", "Roofs", "Rooms",
                "Levels", "Grids", "Columns", "Structural Framing", "Structural Columns",
                "Generic Models", "Furniture", "Plumbing Fixtures", "Mechanical Equipment",
            }
            .Select(n => new ReplCompletion(n, n, "EnumMember", "Category", "1"))
            .ToList();

        // Last resort ONLY when no Revit host catalog exists at all. Geometry names such as
        // "Height" were removed: they are not universal — the Wall example that exposed this
        // bug has "Unconnected Height", not "Height".
        private static readonly string[] CommonParameterNames =
        {
            "Id", "Name", "Mark", "Type Name", "Family Name", "Category", "Comments",
        };

        private static IReadOnlyList<ReplCompletion> CommonParameterCompletions() =>
            CommonParameterNames
                .Select(n => new ReplCompletion(n, n, "Field", "Generic fallback — no document catalog", "1"))
                .ToList();

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
