using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
// CoreScript is just C# script with some custom globals
// Println, Print, Show - these are for output (Show is for table output)
// Doc, UIDoc, UIApp, Transact - these are for Revit API access

// create a wall with some length and height along the x axis
// First create two points
// wall length 4 meters, wall height 3 meters

double lengthinFeet = UnitUtils.ConvertToInternalUnits(4.0, UnitTypeId.Meters);
double heightinFeet = UnitUtils.ConvertToInternalUnits(3.0, UnitTypeId.Meters);


XYZ pt1 = new(lengthinFeet / -2, 0, 0);
XYZ pt2 = new(lengthinFeet / 2, 0, 0);




// Then create a line between those points
Line line = Line.CreateBound(pt1, pt2);

// now create a wall at Level 1 along that line
// first filter the levels and get Level 1

Level? level1 = new FilteredElementCollector(Doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .FirstOrDefault(lvl => lvl.Name == "Level 1");


if (level1 == null)
{
    Println("Level 1 not found!");
    return;
}
else
{
    Transact("create wall", () =>
   {
         Wall wall = Wall.Create(Doc, line, level1.Id, false);
         Println($"Wall created with id: {wall.Id}");
   }

   );
    
}
