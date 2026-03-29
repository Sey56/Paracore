using Autodesk.Revit.UI;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Paracore.Addin.App;
using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using CoreScript.Engine.Logging;
using CoreScript.Engine.Globals;
using Paracore.Addin.Handlers;

namespace Paracore.Addin.Services
{
    public class CoreScriptServer
    {
        private bool _running;
        private readonly string _logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "paracore-data", "logs", "CoreScriptServerLog.txt");
        private IHost? _webHost;
        private readonly UIApplication _uiApp;
        private readonly ILogger _logger;

        public CoreScriptServer(UIApplication uiApp, ILogger logger)
        {
            _uiApp = uiApp;
            _logger = logger;
            _running = false;
            _logger.Log($"Server initialized: {DateTime.Now}", LogLevel.Debug);
        }

        public ILogger GetLogger()
        {
            return _logger;
        }

        public void Start()
        {
            if (_running) return;

            var builder = WebApplication.CreateBuilder();

            // Configure Kestrel for gRPC
            builder.WebHost.ConfigureKestrel(options =>
            {
                options.ListenLocalhost(50051, o => o.Protocols = HttpProtocols.Http2);
                options.Limits.MaxRequestBodySize = 50 * 1024 * 1024;  // 50 MB
                options.Limits.MaxResponseBufferSize = 50 * 1024 * 1024; // 50 MB
            });

            // Register services
            builder.Services.AddGrpc();
            builder.Services.AddSingleton(_uiApp);
            builder.Services.AddCoreScriptEngineServices();
            builder.Services.AddSingleton<ScriptExecutionHandler>();
            builder.Services.AddSingleton<MetadataHandler>();
            builder.Services.AddSingleton<ContextHandler>();
            builder.Services.AddSingleton<FileSystemHandler>();
            builder.Services.AddSingleton<ReplHandler>();

            var app = builder.Build();

            app.UseRouting();
            app.MapGrpcService<CoreScriptRunnerService>();

            _webHost = app;
            _webHost.Start();

            _running = true;
            _logger.Log($"gRPC Server started on http://localhost:50051: {DateTime.Now}", LogLevel.Debug);
        }


        public async Task StopAsync()
        {
            if (!_running || _webHost == null) return;

            await _webHost.StopAsync(TimeSpan.FromSeconds(5));
            _webHost.Dispose();
            _webHost = null;
            _running = false;
            _logger.Log($"gRPC Server stopped: {DateTime.Now}", LogLevel.Debug);
        }

        public void Stop()
        {
            // Offload the asynchronous stopping of gRPC server to a background thread
            // to prevent blocking the UI thread.
            Task.Run(() => StopAsync());
        }

        public bool IsRunning()
        {
            return _running;
        }
    }
}
