using Microsoft.CodeAnalysis;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;

namespace CoreScript.Engine.Core
{
    public static class RevitApiResolver
    {
        private static List<MetadataReference> _revitReferences;

        public static IEnumerable<MetadataReference> GetRevitApiReferences()
        {
            if (_revitReferences == null)
            {
                try
                {
                    string revitInstallPath = Path.GetDirectoryName(Process.GetCurrentProcess().MainModule.FileName);
                    if (!Directory.Exists(revitInstallPath))
                    {
                        // Handle error: Revit not found
                        return Enumerable.Empty<MetadataReference>();
                    }

                    var revitDllPaths = Directory.GetFiles(revitInstallPath, "RevitAPI*.dll");
                    _revitReferences = revitDllPaths
                        .Where(Parsers.ExtractionUtils.IsManagedAssembly)
                        .Select(path => MetadataReference.CreateFromFile(path))
                        .Cast<MetadataReference>()
                        .ToList();
                }
                catch
                {
                    return Enumerable.Empty<MetadataReference>();
                }
            }
            return _revitReferences;
        }
    }
}
