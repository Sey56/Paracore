using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CoreScript.Engine.Core
{
    public class ParameterOptionsComputer
    {
        private readonly Document _doc;
        private static Type[]? _revitTypes;

        public ParameterOptionsComputer(Document doc)
        {
            _doc = doc ?? throw new ArgumentNullException(nameof(doc));
        }

        // ─────────────────────────────────────────────────────────────────────────────────
        // TWO NORMALIZATION RULES, and they must never be mixed up.
        //
        //   CATEGORY names are USER-FACING TEXT. The same category is written "Structural
        //   Framing", "StructuralFraming" and "structuralframing", and all three must resolve
        //   — that is how every category in the engine behaves. So a CATEGORY key ignores
        //   case, spaces and underscores, and accepts the singular ("Doors" = "Door").
        //
        //   CLASS names are IDENTIFIERS. They are reachable BOTH ways — `GetElements<PropertyLine>()`
        //   in the angle brackets and `GetElements("PropertyLine")` in the parentheses — but
        //   always spelled exactly as intellisense gives them, and a class name never contains
        //   a space. "Property Line" is NOT a class; it is the CATEGORY, and it resolves
        //   through the category path. Class matching therefore stays EXACT (case-insensitive,
        //   singular tolerated because `GetElements("Walls")` reading as walls is the point).
        //
        //   ⚠⚠ THE DEFECT THIS REPLACES (2026-10-31). `GetElements("Property Lines")` answered
        //   0 on a document that held one. Two separate faults produced that single lie:
        //
        //     1. The CATEGORY path walked only `Document.Settings.Categories` — the TOP LEVEL.
        //        "Property Lines" is a SUBCATEGORY of Site (id -2001265), so it was never
        //        looked at. Nothing else separated it from "Structural Framing", which works.
        //
        //     2. The zero was then CERTIFIED by `IsKnownElementName`, a different function with
        //        its own rules — it stripped spaces from CLASS names, so it "knew" PropertyLine
        //        and reported "valid Class or Category with 0 instances". The sentence claimed
        //        a resolution that had never happened, and it is indistinguishable from a true
        //        zero. It sent an agent off to build a duplicate boundary.
        //
        //   Hence: ONE normalizer (NameKey), ONE resolver (Resolve), and the message is read
        //   off the resolver's own verdict (NameResolution). Never ask a second function
        //   whether the first one's answer was real.
        // ─────────────────────────────────────────────────────────────────────────────────

        private static string Compact(string s) => s.Replace(" ", "").Replace("_", "").ToLowerInvariant();

        private static string Singularize(string cleanName) =>
            cleanName.EndsWith("ies", StringComparison.OrdinalIgnoreCase)
                ? cleanName.Substring(0, cleanName.Length - 3) + "y"
                : (cleanName.EndsWith("s", StringComparison.OrdinalIgnoreCase) && !cleanName.EndsWith("ss", StringComparison.OrdinalIgnoreCase)
                    ? cleanName.Substring(0, cleanName.Length - 1)
                    : cleanName);

        /// <summary>
        /// A name prepared for matching, carrying BOTH rules so the caller must choose one
        /// explicitly: <see cref="MatchesCategory"/> for category text, <see cref="MatchesClass"/>
        /// for a class identifier. There is deliberately no "default" comparison.
        /// </summary>
        private readonly struct NameKey
        {
            public readonly string Clean;
            public readonly string Singular;
            public readonly string Compact;
            public readonly string SingularCompact;

            private NameKey(string clean, string singular)
            {
                Clean = clean;
                Singular = singular;
                Compact = ParameterOptionsComputer.Compact(clean);
                SingularCompact = ParameterOptionsComputer.Compact(singular);
            }

            public static NameKey From(string name)
            {
                var clean = (name ?? string.Empty).Trim();
                return new NameKey(clean, Singularize(clean));
            }

            /// <summary>
            /// CATEGORY rule — spaces, underscores and case are ignored, singular accepted.
            /// `"Structural Framing"` == `"StructuralFraming"`.
            /// </summary>
            public bool MatchesCategory(string candidate)
            {
                if (string.IsNullOrEmpty(candidate)) return false;
                if (candidate.Equals(Clean, StringComparison.OrdinalIgnoreCase)) return true;
                if (candidate.Equals(Singular, StringComparison.OrdinalIgnoreCase)) return true;

                var c = ParameterOptionsComputer.Compact(candidate);
                return c == Compact || c == SingularCompact;
            }

            /// <summary>
            /// CLASS rule — EXACT. A class name has no spaces and we never invent one.
            /// </summary>
            public bool MatchesClass(string candidate)
            {
                if (string.IsNullOrEmpty(candidate)) return false;
                return candidate.Equals(Clean, StringComparison.OrdinalIgnoreCase)
                    || candidate.Equals(Singular, StringComparison.OrdinalIgnoreCase);
            }
        }

        public List<string> ComputeOptions(string revitElementType, string? category = null)
        {
            if (string.IsNullOrEmpty(revitElementType)) return new List<string>();

            var key = NameKey.From(revitElementType);

            if (_revitTypes == null)
            {
                _revitTypes = typeof(Element).Assembly.GetTypes();
            }

            var enumType = _revitTypes.FirstOrDefault(t => t.IsEnum && key.MatchesClass(t.Name));

            if (enumType != null)
            {
                return Enum.GetNames(enumType).OrderBy(n => n).ToList();
            }

            var elements = ComputeElementOptions(revitElementType, category);
            return elements.Select(GetElementIdentity).Distinct().OrderBy(n => n).ToList();
        }

        public List<Element> ComputeElementOptions(string revitElementType, string? category = null)
        {
            return ComputeElementOptions(revitElementType, category, out _);
        }

        /// <summary>
        /// The same lookup, plus the resolver's verdict — so a caller reporting a ZERO can say
        /// what the zero is a zero OF. See <see cref="NameResolution">NameResolution</see> for
        /// why that matters.
        /// </summary>
        public List<Element> ComputeElementOptions(string revitElementType, string? category, out NameResolution resolution)
        {
            resolution = NameResolution.Unknown((revitElementType ?? string.Empty).Trim());

            if (string.IsNullOrEmpty(revitElementType))
            {
                return new List<Element>();
            }

            try { return GetGenericElements(revitElementType, category, out resolution).ToList(); }
            catch (Exception ex) { Console.WriteLine($"Error computing options for {revitElementType}: {ex.Message}"); return new List<Element>(); }
        }

        public static string GetElementIdentity(Element e)
        {
            if (e == null)
            {
                return "";
            }

            if (e is FamilySymbol fs)
            {
                return $"{fs.FamilyName}: {fs.Name}";
            }

            // Better FamilyInstance display (Family: Type [Mark])
            if (e is FamilyInstance fi)
            {
                string mark = fi.get_Parameter(BuiltInParameter.ALL_MODEL_MARK)?.AsString();
                string idPart = !string.IsNullOrEmpty(mark) ? $"[Mark: {mark}]" : $"[{fi.Id}]";
                return $"{fi.Symbol.FamilyName}: {fi.Name} {idPart}";
            }

            // Professional Sheet formatting
            if (e is ViewSheet s)
            {
                return $"[{s.SheetNumber}] {s.Name}";
            }

            string name = e.Name;
            var identityParams = new[] {
                BuiltInParameter.ROOM_NUMBER,
                BuiltInParameter.SHEET_NUMBER,
                BuiltInParameter.ALL_MODEL_MARK,
                BuiltInParameter.FABRICATION_PART_ITEM_NUMBER
            };

            foreach (var bip in identityParams)
            {
                var p = e.get_Parameter(bip);
                if (p != null && p.HasValue)
                {
                    string? val = p.AsString();
                    if (!string.IsNullOrEmpty(val))
                    {
                        return name.Contains(val) ? name : $"{name} [{val}]";
                    }
                }
            }

            // If it's an instance (not a Type), append the ID to ensure uniqueness in the UI and Hydration.
            // Levels and Materials always have unique names in Revit, so we skip the noisy ID.
            return !(e is ElementType || e is Level || e is Material) ? $"{name} [{e.Id}]" : name;
        }

        public static FilteredElementCollector CreateResilientCollector(Document doc, Type targetType)
        {
            // Quirk 1: Spatial Elements
            if (typeof(SpatialElement).IsAssignableFrom(targetType) || targetType.Name == "Area" || targetType.Name == "Room")
            {
                return new FilteredElementCollector(doc).OfClass(typeof(SpatialElement));
            }

            // Quirk 2: Element Types (Base class or specific types like WallSweepType)
            if (typeof(ElementType).IsAssignableFrom(targetType) || targetType.Name.EndsWith("Type"))
            {
                return new FilteredElementCollector(doc).WhereElementIsElementType();
            }

            // Quirk 3: Generic fallback
            try { return new FilteredElementCollector(doc).OfClass(targetType); }
            catch { return new FilteredElementCollector(doc).WhereElementIsNotElementType(); }
        }

        /// <summary>
        /// Every category in the document at ANY depth — top level AND subcategories.
        /// <para>
        /// ⚠⚠ A subcategory is a real, addressable category, and several of the ones people ask
        /// for most live under another one: "Property Lines" is a subcategory of Site. The
        /// lookup used to enumerate `Settings.Categories` alone, so every nested category was
        /// invisible and answered a confident zero.
        /// </para>
        /// </summary>
        private IEnumerable<Category> EnumerateCategories()
        {
            var stack = new Stack<Category>();
            foreach (Category c in _doc.Settings.Categories) stack.Push(c);

            while (stack.Count > 0)
            {
                var c = stack.Pop();
                yield return c;
                foreach (Category s in c.SubCategories) stack.Push(s);
            }
        }

        private Category? FindCategory(NameKey key)
        {
            // An EXACT name wins over a loose one, so "Site" is never displaced by a
            // subcategory that happens to singularize into the same key.
            Category? loose = null;

            foreach (var cat in EnumerateCategories())
            {
                if (!key.MatchesCategory(cat.Name) && !key.MatchesCategory(Singularize(cat.Name))) continue;

                if (cat.Name.Equals(key.Clean, StringComparison.OrdinalIgnoreCase)) return cat;
                if (loose == null) loose = cat;
            }

            return loose;
        }

        private static BuiltInCategory? FindBuiltInCategory(NameKey key)
        {
            foreach (var bic in Enum.GetValues(typeof(BuiltInCategory)).Cast<BuiltInCategory>())
            {
                if (bic == BuiltInCategory.INVALID) continue;

                var en = bic.ToString();                                        // OST_MultistoryStairs
                if (en.Equals(key.Clean, StringComparison.OrdinalIgnoreCase)) return bic;
                if (en.Equals(key.Singular, StringComparison.OrdinalIgnoreCase)) return bic;

                var enCompact = en.Replace("_", "");                            // OSTMultistoryStairs
                if (enCompact.Equals("OST" + key.Compact, StringComparison.OrdinalIgnoreCase)) return bic;
                if (enCompact.Equals("OST" + key.SingularCompact, StringComparison.OrdinalIgnoreCase)) return bic;

                var noPrefix = enCompact.StartsWith("OST", StringComparison.OrdinalIgnoreCase)
                    ? enCompact.Substring(3)                                    // MultistoryStairs
                    : enCompact;

                if (noPrefix.Equals(key.Compact, StringComparison.OrdinalIgnoreCase)) return bic;
                if (noPrefix.Equals(key.SingularCompact, StringComparison.OrdinalIgnoreCase)) return bic;
            }

            return null;
        }

        /// <summary>
        /// Resolves a name to a category, a class, or an enum — and says which. This is the ONLY
        /// place that decides, and the only thing allowed to describe the outcome.
        /// </summary>
        public NameResolution Resolve(string revitElementType)
        {
            var requested = (revitElementType ?? string.Empty).Trim();
            if (requested.Length == 0) return NameResolution.Unknown(requested);

            var key = NameKey.From(requested);
            var asksTypes = key.Clean.EndsWith("Type", StringComparison.OrdinalIgnoreCase);

            if (_revitTypes == null) _revitTypes = typeof(Element).Assembly.GetTypes();

            // 1. ENUM — a valid name, but there are no ELEMENTS to return. `ComputeOptions`
            //    is the overload that answers with Enum.GetNames; the element overload
            //    answering empty is by design and the PackSdk relies on it.
            var enumType = _revitTypes.FirstOrDefault(t => t.IsEnum && key.MatchesClass(t.Name));
            if (enumType != null)
            {
                return new NameResolution
                {
                    Kind = NameResolutionKind.Enum,
                    Requested = key.Clean,
                    Matched = enumType.Name
                };
            }

            // 2. ELEMENT CLASS — EXACT, never space-stripped. "PropertyLine" resolves here;
            //    "Property Line" does not, because that is the CATEGORY and falls through to
            //    step 3, which is where it actually belongs.
            var classType = _revitTypes.FirstOrDefault(t =>
                t.IsPublic && typeof(Element).IsAssignableFrom(t) && key.MatchesClass(t.Name));

            if (classType != null)
            {
                var types = asksTypes || typeof(ElementType).IsAssignableFrom(classType);
                return new NameResolution
                {
                    Kind = types ? NameResolutionKind.TypeClass : NameResolutionKind.ElementClass,
                    Requested = key.Clean,
                    Matched = classType.Name,
                    ClassType = classType,
                    AsksForTypes = types
                };
            }

            // 3. CATEGORY — top level AND subcategories. This is the fix: "Property Lines"
            //    is a subcategory of Site, id -2001265.
            var category = FindCategory(key);
            if (category != null)
            {
                return new NameResolution
                {
                    Kind = NameResolutionKind.Category,
                    Requested = key.Clean,
                    Matched = category.Name,
                    CategoryId = category.Id,
                    AsksForTypes = asksTypes
                };
            }

            // 4. BuiltInCategory fallback — a category absent from Settings.Categories and with
            //    no matching class is still addressable by its enum name.
            var builtin = FindBuiltInCategory(key);
            if (builtin != null)
            {
                return new NameResolution
                {
                    Kind = NameResolutionKind.Category,
                    Requested = key.Clean,
                    Matched = builtin.Value.ToString(),
                    CategoryId = new ElementId(builtin.Value),
                    AsksForTypes = asksTypes
                };
            }

            // 5. UNKNOWN — a genuine typo. Suggestions come from names that EXIST, never from
            //    a second opinion about validity.
            return NameResolution.Unknown(key.Clean, NearMatches(key));
        }

        private List<string> NearMatches(NameKey key)
        {
            var names = new List<string>();

            if (_revitTypes != null)
            {
                names.AddRange(_revitTypes
                    .Where(t => t.IsPublic && typeof(Element).IsAssignableFrom(t))
                    .Select(t => t.Name));
            }

            names.AddRange(EnumerateCategories().Select(c => c.Name));

            return names
                .Where(n => n.StartsWith(key.Clean, StringComparison.OrdinalIgnoreCase)
                         || n.StartsWith(key.Singular, StringComparison.OrdinalIgnoreCase)
                         || key.Clean.StartsWith(n, StringComparison.OrdinalIgnoreCase))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(n => n)
                .Take(3)
                .ToList();
        }

        private IEnumerable<Element> GetGenericElements(string targetName, string? categoryFilter, out NameResolution resolution)
        {
            resolution = Resolve(targetName);

            try
            {
                // SPECIAL CASE: Family discovery (Loadable Families)
                if (resolution.Requested.Equals("Family", StringComparison.OrdinalIgnoreCase))
                {
                    var familyCollector = new FilteredElementCollector(_doc).OfClass(typeof(Family));
                    var families = familyCollector.Cast<Family>();

                    if (!string.IsNullOrEmpty(categoryFilter))
                    {
                        var filterKey = NameKey.From(categoryFilter);
                        families = families.Where(f =>
                            f.FamilyCategory != null && CategoryFilterMatches(filterKey, f.FamilyCategory));
                    }

                    return families.Cast<Element>();
                }

                switch (resolution.Kind)
                {
                    case NameResolutionKind.Unknown:
                    case NameResolutionKind.Enum:
                        return Enumerable.Empty<Element>();

                    case NameResolutionKind.Category when resolution.CategoryId != null:
                    {
                        var collector = new FilteredElementCollector(_doc).OfCategoryId(resolution.CategoryId);
                        var results = resolution.AsksForTypes
                            ? collector.WhereElementIsElementType().Cast<Element>().ToList()
                            : collector.WhereElementIsNotElementType().Cast<Element>().ToList();

                        // ⚠⚠ INSTANCES MEAN INSTANCES — the "automatic type fallback" that used to
                        //    sit here was REMOVED on 2026-10-14. It returned the category's ElementTypes
                        //    whenever the category had 0 instances, so `GetElements("Doors")` on a
                        //    project with no doors answered with door TYPES: objects that .Count()
                        //    counts as instances, .Delete() deletes (taking every instance of the type
                        //    with them) and .SetVal() writes to the TYPE of. One easy-to-miss INFO line
                        //    was the only signal, and the trap caught a live build on 2026-10-10.
                        //
                        //    ⚠ Types are still reachable — but only by ASKING for them:
                        //      GetElements<FamilySymbol>("Doors")  — a loadable family's symbols
                        //      GetElements<WallType>()             — a system family's types
                        //      GetElements("WallType")             — a name that is itself a type name
                        //    A category with 0 instances returns an EMPTY list, and
                        //    ScriptApi.GetElements reports that zero instead of substituting types.
                        return results;
                    }
                }

                var classType = resolution.ClassType;
                if (classType == null) return Enumerable.Empty<Element>();

                var classCollector = CreateResilientCollector(_doc, classType);
                IEnumerable<Element> elements = classCollector.Cast<Element>().Where(e => classType.IsAssignableFrom(e.GetType()));

                // Filter Types vs Instances
                elements = resolution.AsksForTypes
                    ? elements.Where(e => e is ElementType)
                    : elements.Where(e => !(e is ElementType));

                // Apply Optional Category Filter (e.g. from RevitElements attribute)
                if (!string.IsNullOrEmpty(categoryFilter))
                {
                    var filterKey = NameKey.From(categoryFilter);
                    elements = elements.Where(e => e.Category != null && CategoryFilterMatches(filterKey, e.Category));
                }

                return elements;
            }
            catch (Exception ex) { Console.WriteLine($"[OptionsComputer] Error: {ex.Message}"); return Enumerable.Empty<Element>(); }
        }

        private static bool CategoryFilterMatches(NameKey key, Category category)
        {
            if (key.MatchesCategory(category.Name)) return true;
            if (key.MatchesCategory(Singularize(category.Name))) return true;

            // Last resort: the BuiltInCategory name, for categories whose display name differs
            // from the enum ("Structural Framing" vs OST_StructuralFraming).
            //
            // ⚠⚠ EXACT, NOT "CONTAINS" (fixed 2026-11-08, operator report). This used IndexOf on
            //    the raw enum name, and it compared the SINGULAR key, so "Doors" became "door"
            //    and matched "OST_DoorTags": "door" is a substring of "doortags". Measured live
            //    on TestModel.rvt with GetElements<FamilySymbol>(…):
            //        "Doors"               8 symbols — incl. Door Tags
            //        "Windows"            26         — incl. Window Tags
            //        "Rooms"               7         — EVERY one a Room Tag, zero room types
            //        "Columns"                       — Columns + Structural Columns
            //        "Walls"              14         — Curtain Wall Mullions, Curtain Panels, Wall Tags
            //        "Structural Framing"            — incl. Structural Framing Tags
            //        "Grids" / "Areas"               — Grid Heads / Area Tags only
            //    A contains-check can only ever ADD categories, and every legitimate match here
            //    is exact ("Structural Framing" == structuralframing), so tightening this removes
            //    the false ones and nothing else. The plural forms keep "Door" → OST_Doors and
            //    "Column" → OST_Columns working, which is the only shape the substring served.
            //    ⚠ The FILTER is the only loose place: FindBuiltInCategory above is already exact.
            var bic = category.BuiltInCategory.ToString();
            var enumCompact = Compact(bic.StartsWith("OST", StringComparison.OrdinalIgnoreCase)
                ? bic.Substring(3)
                : bic);

            return enumCompact.Equals(key.Compact, StringComparison.OrdinalIgnoreCase)
                || enumCompact.Equals(key.SingularCompact, StringComparison.OrdinalIgnoreCase)
                || enumCompact.Equals(key.SingularCompact + "s", StringComparison.OrdinalIgnoreCase)
                || enumCompact.Equals(key.Compact + "s", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Document-free validity check: is this name an ELEMENT CLASS, an ENUM, or a
        /// BuiltInCategory member?
        /// <para>
        /// ⚠ It cannot see CATEGORIES — those live on the document — so
        /// <see cref="Resolve">Resolve</see> is the authoritative answer wherever a document is
        /// available.
        /// </para>
        /// <para>
        /// ⚠⚠ It used to strip spaces from CLASS names, so it called "Property Lines" a valid
        /// class while the resolver could not resolve it. Two functions disagreeing about the
        /// same name produced a false "valid Class or Category with 0 instances". Class matching
        /// here is now EXACT, identical to the resolver's rule.
        /// </para>
        /// </summary>
        public static bool IsKnownElementName(string name)
        {
            var requested = (name ?? string.Empty).Trim();
            if (requested.Length == 0) return false;

            var key = NameKey.From(requested);

            if (_revitTypes == null)
            {
                try { _revitTypes = typeof(Element).Assembly.GetTypes(); }
                catch { return false; } // leave null so future calls can retry
            }

            foreach (var t in _revitTypes)
            {
                if (t.IsEnum && key.MatchesClass(t.Name)) return true;
                if (t.IsPublic && typeof(Element).IsAssignableFrom(t) && key.MatchesClass(t.Name)) return true;
            }

            return FindBuiltInCategory(key) != null;
        }
    }
}
