using Autodesk.Revit.DB;

namespace SH_Tools.Services
{
    public static class CustomDwgImportOptions
    {
        public static DWGImportOptions CreateDwgImportOptions()
        {
            return new DWGImportOptions
            {
                ColorMode = ImportColorMode.Preserved,
                Placement = ImportPlacement.Origin,
                OrientToView = true
            };
        }
    }
}