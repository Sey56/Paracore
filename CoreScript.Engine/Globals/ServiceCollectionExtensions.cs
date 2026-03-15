using Microsoft.Extensions.DependencyInjection;
using CoreScript.Engine.Logging;
using CoreScript.Engine.Core; // Added for IMetadataExtractor and IParameterExtractor

namespace CoreScript.Engine.Globals
{
    public static class ServiceCollectionExtensions
    {
        public static IServiceCollection AddCoreScriptEngineServices(this IServiceCollection services)
        {
            services.AddSingleton<ILogger, FileLoggerWrapper>();
            services.AddSingleton<IMetadataExtractor, MetadataExtractor>();
            services.AddSingleton<IParameterExtractor, ParameterExtractor>();

            services.AddSingleton<IParameterService, ParameterService>();
            services.AddSingleton<IScriptCompiler, ScriptCompiler>();
            services.AddSingleton<IScriptParser, ScriptParser>();
            services.AddSingleton<IScriptCombiner, ScriptCombiner>();
            services.AddSingleton<IScriptExecutor, ScriptExecutor>();
            services.AddSingleton<IScriptRewriter, ScriptRewriter>();
            services.AddSingleton<ICodeRunner, CodeRunner>();

            return services;
        }
    }
}
