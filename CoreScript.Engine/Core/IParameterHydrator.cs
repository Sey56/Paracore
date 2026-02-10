using System;

namespace CoreScript.Engine.Core
{
    public interface IParameterHydrator
    {
        T Hydrate<T>(string key, object value);
    }
}
