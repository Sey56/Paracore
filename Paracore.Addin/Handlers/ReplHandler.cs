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
    }
}
