using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace SH_Tools.Services
{
    public static class DoorsInfo
    {
        public static void DisplayDoorsInfo(Document document)
        {
            List<FamilyInstance> doors = new FilteredElementCollector(document)
                .OfCategory(BuiltInCategory.OST_Doors)
                .OfClass(typeof(FamilyInstance))
                .Cast<FamilyInstance>()
                .ToList();

            string s = "";
            foreach (var door in doors)
            {
                s += $"\n{door.Id}  {door.HandFlipped}  {door.FacingFlipped}";
            }
            TaskDialog.Show("Door Flips", s);
        }
    }
}
