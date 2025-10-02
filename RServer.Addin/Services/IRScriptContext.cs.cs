namespace RServer.Addin.Services
{
    using Autodesk.Revit.DB;
    using Autodesk.Revit.UI;
    using System;

    namespace RServer.Addin.Services
    {
        public interface IRScriptContext
        {
            UIApplication UIApp { get; }
            UIDocument UIDoc { get; }
            Document Doc { get; }

            void Print(string message);
            void LogError(string message);

            Action<string>? PrintCallback { get; } // optional
        }
    }
}
