using Autodesk.Revit.UI;

namespace Paracore.Addin.App
{
    /// <summary>
    /// A singleton provider that holds the active Revit UIApplication.
    /// This is necessary because UIApplication is not available during OnStartup.
    /// </summary>
    public class RevitContext
    {
        public UIApplication? UIApplication { get; set; }
    }
}
