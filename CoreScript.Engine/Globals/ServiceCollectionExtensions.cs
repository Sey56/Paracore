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
            services.AddSingleton<IParameterExtractor, ParameterExtractor>(); // Register ParameterExtractor

            return services;
        }
    }
}
