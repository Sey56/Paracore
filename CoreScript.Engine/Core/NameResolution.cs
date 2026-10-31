using System;
using System.Collections.Generic;
using Autodesk.Revit.DB;

namespace CoreScript.Engine.Core
{
    /// <summary>What a name asked of GetElements actually resolved to.</summary>
    public enum NameResolutionKind
    {
        /// <summary>Nothing matched. A genuine typo — not an empty category.</summary>
        Unknown = 0,

        /// <summary>A document Category, top level OR subcategory.</summary>
        Category,

        /// <summary>A Revit Element subclass, named exactly as intellisense spells it.</summary>
        ElementClass,

        /// <summary>An ElementType subclass, or a name ending in "Type" — types were asked for.</summary>
        TypeClass,

        /// <summary>An enum. Valid, but an enum has no elements to collect.</summary>
        Enum
    }

    /// <summary>
    /// The verdict of resolving a name — produced by the SAME code that does the lookup, and
    /// therefore the only thing allowed to describe the outcome.
    /// <para>
    /// ⚠⚠ WHY THIS TYPE EXISTS. The engine used to answer "the document has 0 instances" from a
    /// SECOND function (<c>IsKnownElementName</c>) that had its own matching rules. On 2026-10-31
    /// those rules disagreed: <c>GetElements("Property Lines")</c> found nothing, because the
    /// category is a SUBCATEGORY of Site and the lookup only walked the top level, and then the
    /// validity check — which stripped spaces from CLASS names — declared the name valid. The
    /// result was a confident, false "valid Class or Category with 0 instances" for a document
    /// holding one property line. A caller cannot tell that sentence from a true zero, which is
    /// how an agent ends up building a duplicate boundary to fix a bug that isn't there.
    /// </para>
    /// <para>
    /// So: one resolver, one verdict, and the message is read off the verdict. When the answer is
    /// zero, the sentence names WHAT it resolved to — <c>resolved to category "Property Lines"
    /// (id -2001265)</c> — so a wrong resolution is visible instead of being laundered into a zero.
    /// </para>
    /// </summary>
    public sealed class NameResolution
    {
        /// <summary>What the name resolved to. <see cref="NameResolutionKind.Unknown">Unknown</see> means a typo.</summary>
        public NameResolutionKind Kind { get; init; }

        /// <summary>The name as the caller wrote it, trimmed.</summary>
        public string Requested { get; init; } = "";

        /// <summary>What it actually matched — a category name, a class name, an enum name.</summary>
        public string Matched { get; init; } = "";

        /// <summary>Set when <see cref="Kind">the verdict</see> is a category.</summary>
        public ElementId? CategoryId { get; init; }

        /// <summary>Set when the name resolved to a class.</summary>
        public Type? ClassType { get; init; }

        /// <summary>True when TYPES were asked for rather than instances.</summary>
        public bool AsksForTypes { get; init; }

        /// <summary>Near misses, for a typo. Empty when something actually resolved.</summary>
        public IReadOnlyList<string> NearMatches { get; init; } = Array.Empty<string>();

        /// <summary>False only for a genuine typo. An empty category IS resolved.</summary>
        public bool IsResolved => Kind != NameResolutionKind.Unknown;

        public static NameResolution Unknown(string requested, IReadOnlyList<string>? nearMatches = null) =>
            new NameResolution
            {
                Kind = NameResolutionKind.Unknown,
                Requested = requested,
                NearMatches = nearMatches ?? Array.Empty<string>()
            };

        /// <summary>
        /// What the name resolved TO. This is the half of the answer a zero cannot give you: it
        /// turns "there are 0" into "this is what I looked at, and it holds 0".
        /// </summary>
        public string Describe()
        {
            switch (Kind)
            {
                case NameResolutionKind.Category:
                    return CategoryId == null
                        ? $"category \"{Matched}\""
                        : $"category \"{Matched}\" (id {CategoryId})";
                case NameResolutionKind.ElementClass:
                    return $"class {Matched}";
                case NameResolutionKind.TypeClass:
                    return $"type class {Matched}";
                case NameResolutionKind.Enum:
                    return $"enum {Matched}";
                default:
                    return "nothing";
            }
        }

        /// <summary>The ArgumentException message for a genuine typo.</summary>
        public string UnknownMessage()
        {
            if (NearMatches.Count > 0)
            {
                var quoted = string.Join("' or '", NearMatches);
                return $"'{Requested}' is not a valid Class or Category. Did you mean '{quoted}'?"
                     + " For the full list run GetMagicNames().";
            }

            return $"'{Requested}' is not a valid Class or Category."
                 + " For the full list run GetMagicNames().";
        }
    }
}
