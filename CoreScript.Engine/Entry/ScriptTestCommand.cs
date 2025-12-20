using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using CoreScript.Engine.Context;

namespace CoreScript.Engine.Entry
{
    [Transaction(TransactionMode.Manual)]
    public class ScriptTestCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            UIApplication uiApp = commandData.Application;

            // 🧷 Ensure Roslyn DLL resolution if testing fails
            CoreScript.Engine.Globals.CustomAssemblyResolver.Initialize();

            // 🧪 Manual test
            CoreScript.Engine.Logging.FileLogger.Log("🧪 Manual FileLogger test: Is this working?");

            // ✅ Wrap UIApplication in TestScriptContext
            var context = new Tests.TestScriptContext(uiApp);
            var tester = new Tests.CodeRunnerTests(context);

            // 🧱 Choose test method (comment/uncomment to toggle)
            tester.RunWallCreationTest();
            // tester.RunReadOnlyTest();

            TaskDialog.Show("CoreScript", "Test script executed.");
            return Result.Succeeded;
        }
    }
}
