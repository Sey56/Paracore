using CoreScript;
using CoreScript.Engine.Core;
using CoreScript.Engine.Runtime;
using Paracore.Addin.Context;
using Paracore.Addin.Models;
using Paracore.Addin.Services;
using System;
using System.Threading.Tasks;
using Autodesk.Revit.UI;
using Paracore.Addin.App;

namespace Paracore.Addin.Handlers
{
    public class ReplHandler
    {
        private readonly RevitContext _revitContext;

        public ReplHandler(RevitContext revitContext)
        {
            _revitContext = revitContext;
        }

        private UIApplication? _uiApp => _revitContext.UIApplication;

        // Patterns banned in read-only exploration mode.
        // Simple substring scan — catches all standard Paracore and Revit API writes.
        private static readonly string[] _writePatterns = new[]
        {
            ".SetVal(", ".SetNum(", ".Delete()", ".SetParam(",
            ".Hide()", ".Unhide()", ".Isolate()",
            "Transact(", "NewFamilyInstance",
            "Wall.Create", "Floor.Create", "doc.Create"
        };

        private static bool ContainsWriteOperations(string code)
        {
            foreach (var pattern in _writePatterns)
                if (code.Contains(pattern)) return true;
            return false;
        }

        public async Task<ExecuteReplResponse> ExecuteRepl(ExecuteReplRequest request)
        {
            // ── Layer 1: Session gate (one-time per Revit session) ──
            bool approved = await CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext<bool>(() =>
            {
                return SessionGate.EnsureApproved(request.Source ?? "paracore");
            });

            if (!approved)
                return new ExecuteReplResponse
                {
                    IsSuccess = false,
                    ErrorMessage = "Code execution denied for this Revit session. Restart Revit to reset.",
                    UserRejected = true
                };

            // ── Layer 2: Read-only enforcement for exploration ──
            if (request.ExecutionMode == "read_only")
            {
                if (ContainsWriteOperations(request.Code))
                    return new ExecuteReplResponse
                    {
                        IsSuccess = false,
                        ErrorMessage = "Read-only violation: exploration code contains write operations. Use execute_dynamic_query for writes.",
                        ReadOnlyViolation = true
                    };
            }

            try
            {
                var context = new ServerContext(_uiApp);

                // Use the dispatcher to run the REPL command on the Revit UI thread
                var result = await CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(async () =>
                {
                    return await ReplSessionManager.ExecuteAsync(request.Code, request.SessionId, context, request.LicenseTier);
                });

                // Unwrap the nested task result
                var (isSuccess, output, error, structuredOutput) = await result;

                var response = new ExecuteReplResponse
                {
                    IsSuccess = isSuccess,
                    Output = output,
                    ErrorMessage = error
                };

                if (context.PipelineDiagnostics != null)
                    response.PipelineDiagnostics.AddRange(context.PipelineDiagnostics);

                foreach (var item in structuredOutput)
                {
                    try
                    {
                        var temp = System.Text.Json.JsonSerializer.Deserialize<StructuredOutputPoco>(item,
                            new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                        if (temp != null)
                        {
                            response.StructuredOutput.Add(new CoreScript.StructuredOutputItem
                            {
                                Type = temp.Type ?? "",
                                Data = temp.Data ?? "",
                                Title = temp.Title ?? ""
                            });
                        }
                    }
                    catch
                    {
                    }
                }

                return response;
            }
            catch (Exception ex)
            {
                return new ExecuteReplResponse
                {
                    IsSuccess = false,
                    ErrorMessage = ex.Message
                };
            }
        }

        /// <summary>
        /// IntelliSense for the REPL playground. Read-only: it compiles the buffer in an
        /// in-memory Roslyn workspace and returns completion suggestions. It never executes
        /// the code and never touches the Revit document.
        ///
        /// ⚠ It deliberately does NOT go through <see cref="CoreScriptExecutionDispatcher"/>:
        /// completion is pure text analysis against already-loaded assemblies, so it needs no
        /// UI-thread hop and no document lock. Keeping it off the dispatcher is what lets it
        /// answer on every keystroke without competing with a running command.
        /// </summary>
        public async Task<GetReplCompletionsResponse> GetReplCompletions(GetReplCompletionsRequest request)
        {
            try
            {
                var completions = await ReplCompletionProvider.GetCompletionsAsync(
                    request.Code, request.CaretOffset);

                var response = new GetReplCompletionsResponse { IsSuccess = true };
                foreach (var item in completions)
                {
                    response.Items.Add(new ReplCompletionItem
                    {
                        Label = item.Label,
                        InsertText = item.InsertText,
                        Kind = item.Kind,
                        Detail = item.Detail ?? string.Empty,
                        SortText = item.SortText
                    });
                }

                return response;
            }
            catch (Exception ex)
            {
                // An editor convenience must never break its caller.
                return new GetReplCompletionsResponse
                {
                    IsSuccess = false,
                    ErrorMessage = ex.Message
                };
            }
        }

        /// <summary>
        /// Red squiggles for the REPL playground. Read-only: it compiles the buffer in the
        /// same in-memory Roslyn workspace as completion and returns warnings/errors in the
        /// buffer's own coordinates. Like completion, it needs no UI-thread hop.
        ///
        /// ⚠ The engine's <c>ReplDiagnostic</c> record and the generated proto message share a
        /// name; the proto one is qualified below. Renaming either would break the wire.
        /// </summary>
        public async Task<GetReplDiagnosticsResponse> GetReplDiagnostics(GetReplDiagnosticsRequest request)
        {
            try
            {
                var diagnostics = await ReplCompletionProvider.GetDiagnosticsAsync(request.Code);

                var response = new GetReplDiagnosticsResponse { IsSuccess = true };
                foreach (var diagnostic in diagnostics)
                {
                    response.Items.Add(new CoreScript.ReplDiagnostic
                    {
                        StartLine = diagnostic.StartLine,
                        StartColumn = diagnostic.StartColumn,
                        EndLine = diagnostic.EndLine,
                        EndColumn = diagnostic.EndColumn,
                        Message = diagnostic.Message,
                        Severity = diagnostic.Severity
                    });
                }

                return response;
            }
            catch (Exception ex)
            {
                return new GetReplDiagnosticsResponse
                {
                    IsSuccess = false,
                    ErrorMessage = ex.Message
                };
            }
        }

        /// <summary>
        /// Symbol hover for the REPL playground. Read-only: it resolves the symbol under the
        /// caret in the same in-memory Roslyn workspace as completion and diagnostics, and never
        /// executes the code or touches the Revit document. Like them, it needs no UI-thread hop.
        ///
        /// ⚠ "Nothing to show" is NOT a failure. A caret over whitespace returns a SUCCESSFUL
        /// response with no <see cref="CoreScript.ReplHoverInfo"/>. Reporting that as an error
        /// would surface a message every time the mouse crossed a space.
        /// </summary>
        public async Task<GetReplHoverResponse> GetReplHover(GetReplHoverRequest request)
        {
            try
            {
                var hover = await ReplCompletionProvider.GetHoverAsync(request.Code, request.CaretOffset);

                var response = new GetReplHoverResponse { IsSuccess = true };
                if (hover != null)
                {
                    response.Info = new CoreScript.ReplHoverInfo
                    {
                        Signature = hover.Signature,
                        Documentation = hover.Documentation,
                        Kind = hover.Kind,
                        StartLine = hover.StartLine,
                        StartColumn = hover.StartColumn,
                        EndLine = hover.EndLine,
                        EndColumn = hover.EndColumn
                    };
                }

                return response;
            }
            catch (Exception ex)
            {
                // An editor convenience must never break its caller.
                return new GetReplHoverResponse
                {
                    IsSuccess = false,
                    ErrorMessage = ex.Message
                };
            }
        }
    }
}
