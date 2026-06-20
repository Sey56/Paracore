using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// Stub methods for the free add-in. Every method throws a clear upgrade
    /// message instead of a confusing CS0103 compiler error.
    ///
    /// In the pro add-in (paracore-pro), TakeOffExtensions.cs has real
    /// implementations gated behind LicenseContext.RequireEnterprise("TakeOff").
    /// </summary>
    public static class TakeOffExtensions
    {
        private const string _upgradeMsg =
            "This feature requires Paracore Pro. Contact codarch46@gmail.com to upgrade.";

        public static IEnumerable<object> GetConcreteQuantities(this IEnumerable<Element> elements)
        { throw new InvalidOperationException(_upgradeMsg); }

        public static IEnumerable<object> GetConcreteSummary(this Document doc)
        { throw new InvalidOperationException(_upgradeMsg); }

        public static IEnumerable<object> GetSteelTonnage(this IEnumerable<Element> elements)
        { throw new InvalidOperationException(_upgradeMsg); }

        public static IEnumerable<object> GetSteelTonnageSummary(this Document doc)
        { throw new InvalidOperationException(_upgradeMsg); }

        public static IEnumerable<object> GetExcavationQuantities(this IEnumerable<Element> elements,
            double workingAllowance = 0.6)
        { throw new InvalidOperationException(_upgradeMsg); }

        public static IEnumerable<object> GetDoorSchedule(this IEnumerable<FamilyInstance> instances)
        { throw new InvalidOperationException(_upgradeMsg); }

        public static IEnumerable<object> GetWindowSchedule(this IEnumerable<FamilyInstance> instances)
        { throw new InvalidOperationException(_upgradeMsg); }

        public static IEnumerable<object> GetLinearQuantities(this IEnumerable<Element> elements,
            string groupLabel = "Linear")
        { throw new InvalidOperationException(_upgradeMsg); }

        public static IEnumerable<object> GetLinearSummary(this IEnumerable<Element> elements,
            string groupLabel = "Linear")
        { throw new InvalidOperationException(_upgradeMsg); }

        public static IEnumerable<object> GetQuantitiesByLevel(this IEnumerable<Element> elements)
        { throw new InvalidOperationException(_upgradeMsg); }

        public static IEnumerable<object> GetLevels(this Document doc)
        { throw new InvalidOperationException(_upgradeMsg); }

        public static IEnumerable<object> GetFloorFinishAreas(this IEnumerable<Element> floors)
        { throw new InvalidOperationException(_upgradeMsg); }

        public static IEnumerable<object> GetFloorFinishSummary(this Document doc)
        { throw new InvalidOperationException(_upgradeMsg); }

        public static IEnumerable<object> GetWallFinishAreas(this IEnumerable<Element> walls)
        { throw new InvalidOperationException(_upgradeMsg); }

        public static IEnumerable<object> GetMaterialQuantities(this IEnumerable<Element> elements)
        { throw new InvalidOperationException(_upgradeMsg); }

        public static IEnumerable<object> GetMaterialBreakdown(this IEnumerable<Element> elements)
        { throw new InvalidOperationException(_upgradeMsg); }

        public static IEnumerable<object> GetCompoundStructureLayers(this IEnumerable<ElementType> types)
        { throw new InvalidOperationException(_upgradeMsg); }

        public static IEnumerable<object> ComputeFormwork(this IEnumerable<Element> elements)
        { throw new InvalidOperationException(_upgradeMsg); }

        public static IEnumerable<object> GetRoomData(this IEnumerable<Room> rooms)
        { throw new InvalidOperationException(_upgradeMsg); }

        public static IEnumerable<object> GetCountsByType(this IEnumerable<Element> elements)
        { throw new InvalidOperationException(_upgradeMsg); }

        public static IEnumerable<object> GetModelCategoryCounts(this Document doc)
        { throw new InvalidOperationException(_upgradeMsg); }

        public static IEnumerable<object> GetElementSummary(this IEnumerable<Element> elements,
            int maxCount = 200)
        { throw new InvalidOperationException(_upgradeMsg); }
    }
}
