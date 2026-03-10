using System;
using System.Collections.Generic;

namespace CoreScript.Engine.Core
{
    public interface IRevitObjectResolver
    {
        object ResolveElement(object val, Type targetType, IEnumerable<object>? candidatePool = null);
        object ResolveReference(string refString, Type targetType);
        object ResolveXYZ(string xyzString);
    }
}
