using System;

namespace CoreScript.Engine.Core
{
    public interface IRevitObjectResolver
    {
        object ResolveElement(object val, Type targetType);
        object ResolveReference(string refString, Type targetType);
        object ResolveXYZ(string xyzString);
    }
}
