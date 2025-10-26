using Microsoft.CodeAnalysis;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;

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
                    string revitInstallPath = @"C:\Program Files\Autodesk\Revit 2025";
                    if (!Directory.Exists(revitInstallPath))
                    {
                        // Handle error: Revit not found
                        return Enumerable.Empty<MetadataReference>();
                    }

                    var revitDllPaths = Directory.GetFiles(revitInstallPath, "RevitAPI*.dll");
                    _revitReferences = revitDllPaths
                        .Where(IsManagedAssembly)
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

        private static bool IsManagedAssembly(string path)
        {
            try
            {
                AssemblyName.GetAssemblyName(path);
                return true;
            }
            catch
            {
                return false;
            }
        }
    }
}
