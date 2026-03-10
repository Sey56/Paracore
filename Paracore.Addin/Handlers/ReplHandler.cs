using CoreScript;
using CoreScript.Engine.Core;
using CoreScript.Engine.Runtime;
using Paracore.Addin.Context;
using System;
using System.Threading.Tasks;
using Autodesk.Revit.UI;

namespace Paracore.Addin.Handlers
{
    public class ReplHandler
    {
        private readonly UIApplication _uiApp;

        public ReplHandler(UIApplication uiApp)
        {
            _uiApp = uiApp;
        }

        public async Task<ExecuteReplResponse> ExecuteRepl(ExecuteReplRequest request)
        {
            try
            {
                var context = new ServerContext(_uiApp);
                
                // Use the dispatcher to run the REPL command on the Revit UI thread
                var result = await CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(async () =>
                {
                    return await ReplSessionManager.ExecuteAsync(request.Code, request.SessionId, context);
                });

                // Unwrap the nested task result
                var (isSuccess, output, error) = await result;

                return new ExecuteReplResponse
                {
                    IsSuccess = isSuccess,
                    Output = output,
                    ErrorMessage = error
                };
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
