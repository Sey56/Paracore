using Microsoft.Extensions.DependencyInjection;
using RScript.Engine.Logging;
using RScript.Engine.Core; // Added for IMetadataExtractor and IParameterExtractor

namespace RScript.Engine.Globals
{
    public static class ServiceCollectionExtensions
    {
        public static IServiceCollection AddRScriptEngineServices(this IServiceCollection services)
        {
            services.AddSingleton<ILogger, FileLoggerWrapper>();
            services.AddSingleton<IMetadataExtractor, MetadataExtractor>();
            services.AddSingleton<IParameterExtractor, ParameterExtractor>(); // Register ParameterExtractor

            return services;
        }
    }
}
