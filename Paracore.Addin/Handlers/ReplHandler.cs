using CoreScript;
using CoreScript.Engine.Core;
using CoreScript.Engine.Runtime;
using Paracore.Addin.Context;
using Paracore.Addin.Models;
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

        public async Task<ExecuteReplResponse> ExecuteRepl(ExecuteReplRequest request)
        {
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
