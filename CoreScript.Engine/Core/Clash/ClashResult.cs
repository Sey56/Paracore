using System;
using Autodesk.Revit.DB;

namespace CoreScript.Engine.Core.Clash
{
    public enum ClashType { Hard, Soft }

    /// <summary>
    /// Represents a single interference (clash) between two Revit elements.
    /// Includes optional volumetric and coordinate data for high-end auditing.
    /// </summary>
    public class ClashResult
    {
        public ElementId ElementIdA { get; set; }
        public ElementId ElementIdB { get; set; }
        public string NameA { get; set; }
        public string NameB { get; set; }
        public string CategoryA { get; set; }
        public string CategoryB { get; set; }
        public ClashType Type { get; set; } = ClashType.Hard;
        public string SystemA { get; set; }
        public string SystemB { get; set; }
        
        /// <summary>
        /// ID of the temporary intersection geometry (DirectShape) created for visualization.
        /// Serialized as a long for the frontend coordination table.
        /// </summary>
        public long? HelperId { get; set; }
        
        /// <summary>
        /// Precise intersection volume in cubic meters.
        /// Only calculated if requested (High-End Audit).
        /// </summary>
        public double IntersectionVolume { get; set; }
        
        /// <summary>
        /// The center point of the clash for "Zoom to Clash" functionality.
        /// </summary>
        public XYZ Centroid { get; set; }

        /// <summary>
        /// Creates a shallow copy of the clash result.
        /// </summary>
        public ClashResult Clone() => (ClashResult)this.MemberwiseClone();

        public override string ToString()
        {
            var helper = HelperId.HasValue && HelperId.Value != -1 ? $" [Helper: {HelperId}]" : "";
            return $"Clash: {NameA} ({ElementIdA}) <-> {NameB} ({ElementIdB}) | Vol: {IntersectionVolume:F4} m3{helper}";
        }
    }
}
