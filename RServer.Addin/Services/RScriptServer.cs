using Autodesk.Revit.UI;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using RServer.Addin.App;
using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using RScript.Engine.Logging; // Added
using RScript.Engine.Globals; // Added

namespace RServer.Addin.Services
{
    public class RScriptServer
    {
        private bool _running;
        private readonly string _logPath = Path.Combine(RServerApp.HomePath, "RScriptServerLog.txt");
        private IHost? _webHost;
        private readonly UIApplication _uiApp;
        private readonly ILogger _logger; // Added

        public RScriptServer(UIApplication uiApp, ILogger logger) // Modified
        {
            _uiApp = uiApp;
            _logger = logger; // Added
            _running = false;
            _logger.Log($"Server initialized: {DateTime.Now}", LogLevel.Debug); // Modified
        }

        public void Start()
        {
            if (_running) return;

            var builder = Host.CreateDefaultBuilder()
                .ConfigureWebHostDefaults(webBuilder =>
                { 
                    webBuilder.ConfigureKestrel(options =>
                    {
                        options.ListenLocalhost(50051, o => o.Protocols = HttpProtocols.Http2);
                        // Set max message size for gRPC
                        options.Limits.MaxRequestBodySize = 50 * 1024 * 1024; // 50 MB
                        options.Limits.MaxResponseBufferSize = 50 * 1024 * 1024; // 50 MB
                    });
                    // webBuilder.UseUrls("http://localhost:50051"); // Removed as Kestrel is now explicitly configured
                    webBuilder.ConfigureServices(services =>
                    {
                        services.AddGrpc();
                        services.AddSingleton(_uiApp); // Register UIApplication as a singleton
                        services.AddRScriptEngineServices(); // Add RScript.Engine services
                    });
                    webBuilder.Configure(app =>
                    {
                        app.UseRouting();
                        app.UseEndpoints(endpoints =>
                        {
                            endpoints.MapGrpcService<RScriptRunnerService>();
                        });
                    });
                });

            _webHost = builder.Build();
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
            _logger.Log($"Server stopped: {DateTime.Now}", LogLevel.Debug);
        }

        public void Stop()
        {
            // Offload the asynchronous stopping to a background thread
            // to prevent blocking the UI thread.
            Task.Run(() => StopAsync());
        }

        public bool IsRunning() => _running;
    }
}
