using System;
using System.Collections.Generic;

namespace CoreScript.Engine.Core
{
    public interface IParameterHydrator
    {
        T Hydrate<T>(string key, object value, IEnumerable<object>? candidatePool = null);
    }
}
