using Autodesk.Revit.UI;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// How a ribbon contribution is drawn.
    ///
    /// The host picks the control from this value; a pack never touches the Revit ribbon API.
    /// <see cref="PushButton"/> is the default, so a contribution written before this enum
    /// existed keeps producing exactly the button it produced then.
    /// </summary>
    public enum RibbonItemKind
    {
        /// <summary>A large (32px) button that runs one command. The default.</summary>
        PushButton,

        /// <summary>
        /// A small (16px) button drawn in a vertical stack with its neighbours. Consecutive
        /// <see cref="StackedSmall"/> contributions are grouped by the host, two or three to a
        /// stack — which is how a panel holds six tools without six large buttons.
        /// </summary>
        StackedSmall,

        /// <summary>
        /// A dropdown that holds several commands. Built from <see cref="RibbonContribution.Children"/>;
        /// the contribution itself runs nothing.
        /// </summary>
        PulldownButton,

        /// <summary>
        /// A split button: the first child is the face button, the rest drop down behind it.
        /// </summary>
        SplitButton,
    }

    /// <summary>
    /// One ribbon button a pack contributes to the host's Paracore ribbon panel.
    ///
    /// A pack cannot add a button the way the add-in's own commands are added. The add-in's
    /// <c>AddProRibbonButtons</c> hook is a <c>partial</c> method, and a <c>partial</c> method
    /// cannot span assemblies — the compiler erases both the method and its call site in a
    /// build that omits the body, so a free add-in has no button code at all. A pack is a
    /// separate assembly by definition, so it contributes at RUNTIME through
    /// <see cref="RibbonSurface"/> instead.
    ///
    /// ⚠ <see cref="CommandType"/> is a <see cref="Type"/>, not a type NAME. The string a
    /// button carries is a ROUTING KEY: a rename would not error, it would leave the host
    /// resolving a type that no longer exists, and the failure would surface on the first
    /// click rather than at load. Handing over the type itself makes a rename a COMPILE ERROR
    /// in the pack, and lets the host reach the declaring assembly directly instead of
    /// scanning every loaded assembly for a matching name.
    /// </summary>
    public sealed class RibbonContribution
    {
        /// <summary>
        /// Describes one button.
        /// </summary>
        /// <param name="name">
        /// The button's internal name. ⚠ Must be unique within the panel — Revit refuses to add
        /// two buttons with the same name — and is an IDENTITY only, never parsed.
        /// </param>
        /// <param name="text">The button face text, e.g. <c>"BOQ\nSection"</c>.</param>
        /// <param name="toolTip">The tooltip. <see langword="null"/> becomes the empty string.</param>
        /// <param name="commandType">
        /// The pack's <see cref="IExternalCommand"/> implementation. Verified here, so a pack
        /// that announces something Revit cannot run fails at LOAD time instead of on the
        /// first click.
        /// </param>
        /// <param name="iconPath">
        /// Absolute path to a PNG on disk, or <see langword="null"/> for no icon.
        ///
        /// ⚠ A FILE PATH, not a <c>pack://</c> URI. A pack's WPF resources do not resolve
        /// across assemblies, and the pack is loaded into an isolated load context the WPF
        /// resource loader does not search, so <c>pack://application:,,,/Pack;component/…</c>
        /// fails at runtime. The pack computes this path from its own
        /// <c>Assembly.Location</c>.
        /// </param>
        /// <param name="helpUrl">
        /// The URL Revit opens for the button's contextual help (F1 / the "?" affordance),
        /// or <see langword="null"/> to declare none. It belongs to the contribution rather
        /// than to the host, because only the pack knows which page documents its own button.
        /// </param>
        public RibbonContribution(
            string name,
            string text,
            string toolTip,
            Type commandType,
            string? iconPath = null,
            string? helpUrl = null)
        {
            if (string.IsNullOrWhiteSpace(name))
            {
                throw new ArgumentException("A ribbon contribution needs a non-empty name.", nameof(name));
            }

            if (string.IsNullOrWhiteSpace(text))
            {
                throw new ArgumentException("A ribbon contribution needs non-empty button text.", nameof(text));
            }

            ArgumentNullException.ThrowIfNull(commandType);

            if (!typeof(IExternalCommand).IsAssignableFrom(commandType))
            {
                throw new ArgumentException(
                    $"'{commandType.FullName}' does not implement {nameof(IExternalCommand)}, so Revit cannot run it as a ribbon command.",
                    nameof(commandType));
            }

            Name = name;
            Text = text;
            ToolTip = toolTip ?? string.Empty;
            CommandType = commandType;
            IconPath = iconPath;
            HelpUrl = helpUrl;
        }

        /// <summary>
        /// Describes a CONTAINER — a pulldown or split button that runs nothing itself and
        /// draws its <paramref name="children"/> instead.
        ///
        /// ⚠ One level deep only. A child that is itself a container is rejected, because
        /// Revit's pulldown API does not nest and a pack that tried would lose buttons
        /// silently at load.
        /// </summary>
        /// <param name="name">Container identity, unique across all contributions.</param>
        /// <param name="text">The face text of the container itself.</param>
        /// <param name="toolTip">Tooltip; <see langword="null"/> becomes the empty string.</param>
        /// <param name="children">
        /// The commands it holds, in display order. Must not be empty — a dropdown with no
        /// items is invisible in Revit and would read as "the pack failed to load".
        /// </param>
        public RibbonContribution(
            string name,
            string text,
            string toolTip,
            IReadOnlyList<RibbonContribution> children)
        {
            if (string.IsNullOrWhiteSpace(name))
            {
                throw new ArgumentException("A ribbon contribution needs a non-empty name.", nameof(name));
            }

            if (string.IsNullOrWhiteSpace(text))
            {
                throw new ArgumentException("A ribbon contribution needs non-empty button text.", nameof(text));
            }

            ArgumentNullException.ThrowIfNull(children);

            if (children.Count == 0)
            {
                throw new ArgumentException(
                    "A pulldown or split button needs at least one child command.", nameof(children));
            }

            foreach (RibbonContribution child in children)
            {
                ArgumentNullException.ThrowIfNull(child);

                if (child.Children.Count > 0)
                {
                    throw new ArgumentException(
                        $"'{child.Name}' is itself a container. Revit pulldowns do not nest; flatten it.",
                        nameof(children));
                }
            }

            Name = name;
            Text = text;
            ToolTip = toolTip ?? string.Empty;
            CommandType = null;
            Children = children;
            Kind = RibbonItemKind.PulldownButton;
        }

        /// <summary>Internal button name — an identity only, never a routing key.</summary>
        public string Name { get; }

        /// <summary>Button face text.</summary>
        public string Text { get; }

        /// <summary>Tooltip, possibly empty.</summary>
        public string ToolTip { get; }

        /// <summary>
        /// The pack command this button runs, or <see langword="null"/> for a container, which
        /// runs nothing and exists only to hold <see cref="Children"/>.
        /// </summary>
        public Type? CommandType { get; }

        /// <summary>Absolute PNG path, or <see langword="null"/> for no icon.</summary>
        public string? IconPath { get; }

        /// <summary>Contextual-help URL, or <see langword="null"/> when the pack declared none.</summary>
        public string? HelpUrl { get; }

        /// <summary>
        /// The ribbon tab to draw into. <c>"Paracore"</c> by default.
        ///
        /// ⚠ This is the answer to two different needs, which is why it is a string rather than
        /// a flag. A pack whose tools no longer fit the Paracore tab names another tab and the
        /// host creates it. A pack sold to a specific company names that company's tab, so it
        /// sits beside Paracore and shares nothing with it. The host creates whatever tab it is
        /// told to create, and only ever once per session.
        /// </summary>
        public string Tab { get; init; } = "Paracore";

        /// <summary>
        /// The panel within <see cref="Tab"/>. Empty means <c>"Tools"</c>.
        ///
        /// A panel is the visual group — the thing with a title under it. Tools that belong to
        /// one family should share a panel; tools that are unrelated should not, or the ribbon
        /// reads as one undifferentiated row.
        /// </summary>
        public string Panel { get; init; } = "";

        /// <summary>How this contribution is drawn. Defaults to a large button.</summary>
        public RibbonItemKind Kind { get; init; } = RibbonItemKind.PushButton;

        /// <summary>
        /// Position within its panel, ascending. Ties keep registration order.
        ///
        /// ⚠ Not an index — leave gaps (10, 20, 30) so a later tool can be inserted between two
        /// existing ones without renumbering everything.
        /// </summary>
        public int Order { get; init; }

        /// <summary>
        /// Absolute PNG path for the 16px image, used by <see cref="RibbonItemKind.StackedSmall"/>
        /// and as the small image elsewhere. Falls back to <see cref="IconPath"/> when null.
        /// </summary>
        public string? SmallIconPath { get; init; }

        /// <summary>
        /// The commands a container holds. Empty for anything that is not a pulldown or split
        /// button — see the container constructor, which is the only supported way to fill it.
        /// </summary>
        public IReadOnlyList<RibbonContribution> Children { get; init; } = [];
    }

    /// <summary>
    /// The engine's ribbon-surface extension point.
    ///
    /// The engine is free and generalist; a pack is what carries a specialist capability. A
    /// pack that ships a ribbon button announces it here at load time, and the chain that
    /// turns the announcement into a working button has three links, none of which lets the
    /// pack reference the add-in:
    ///
    /// <list type="number">
    /// <item>The PACK calls <see cref="Add"/> from its own registration, passing the
    /// <see cref="Type"/> of its <see cref="IExternalCommand"/>.</item>
    /// <item>The ADD-IN, after loading packs, reads <see cref="Contributions"/> and adds one
    /// <c>PushButtonData</c> per entry — into the panel it already owns, pointing at the shim
    /// rather than at the pack.</item>
    /// <item>The SHIM dispatches the click back into the isolated load context, where the pack
    /// actually lives. ⚠ The pack must NOT be the button's target assembly: Revit resolves a
    /// button's assembly into the DEFAULT context, so pointing at the pack would load a SECOND
    /// copy of it — and with it a second engine — and the copy Revit ran would register into
    /// statics the REPL never reads.</item>
    /// </list>
    ///
    /// ⚠ Register from the pack's own registration, so the surface is present exactly when the
    /// pack is loaded, with no coordination required from the host.
    /// </summary>
    public static class RibbonSurface
    {
        /// <summary>
        /// The shape of the contribution model the running engine understands.
        ///
        /// <list type="bullet">
        /// <item><c>1</c> — name, text, tooltip, command, icon, help. Every contribution is one
        /// large button in one panel on the Paracore tab.</item>
        /// <item><c>2</c> — adds <see cref="RibbonContribution.Kind"/>, <c>Tab</c>, <c>Panel</c>,
        /// <c>Order</c>, <c>SmallIconPath</c> and <c>Children</c>.</item>
        /// </list>
        ///
        /// ⚠ A pack built against a NEWER engine than the one installed must check this and
        /// degrade — emit plain <see cref="RibbonItemKind.PushButton"/> contributions — rather
        /// than announce a pulldown the old host will draw as a flat button or drop entirely.
        /// A dropped button is indistinguishable from a failed install.
        /// </summary>
        public const int ApiVersion = 2;

        private static readonly object _gate = new();
        private static readonly List<RibbonContribution> _contributions = [];

        /// <summary>
        /// Announces one ribbon contribution. Idempotent by <see cref="RibbonContribution.Name"/> —
        /// the first announcement wins — and safe to call from any thread.
        /// </summary>
        /// <param name="contribution">The contribution to announce. Must not be <see langword="null"/>.</param>
        public static void Add(RibbonContribution contribution)
        {
            ArgumentNullException.ThrowIfNull(contribution);

            lock (_gate)
            {
                foreach (RibbonContribution existing in _contributions)
                {
                    if (string.Equals(existing.Name, contribution.Name, StringComparison.Ordinal))
                    {
                        return;
                    }
                }

                _contributions.Add(contribution);
            }
        }

        /// <summary>
        /// The buttons packs have announced, in registration order.
        ///
        /// ⚠ Empty when no pack is loaded, which is what keeps a free-only ribbon identical to
        /// a build with no pack mechanism at all: the host draws nothing extra.
        /// </summary>
        public static IReadOnlyList<RibbonContribution> Contributions
        {
            get
            {
                lock (_gate)
                {
                    return [.. _contributions];
                }
            }
        }
    }
}
