using System;

namespace RScript.Engine.Attributes
{
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property)]
    public class ScriptParameterAttribute : Attribute
    {
    }
}