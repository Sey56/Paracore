// 1. Query & Setup
Params p = new();

// Validation logic here

public class Params
{
    public List<Wall>? MyInstanceWalls { get; set; }

    [Select(SelectionType.Point)]
    public XYZ? MyPoint { get; set; }

    [Select(SelectionType.Edge)]

    public Edge? MyEdge { get; set; }

    [Select(SelectionType.Face)]
    public Face? MyFace { get; set; }

    [Select(SelectionType.Element)]
    public Reference? MyElement { get; set; }
}
