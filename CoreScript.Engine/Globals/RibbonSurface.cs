using Autodesk.Revit.UI;

namespace CoreScript.Engine.Globals
{
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

        /// <summary>Internal button name — an identity only, never a routing key.</summary>
        public string Name { get; }

        /// <summary>Button face text.</summary>
        public string Text { get; }

        /// <summary>Tooltip, possibly empty.</summary>
        public string ToolTip { get; }

        /// <summary>The pack command this button runs.</summary>
        public Type CommandType { get; }

        /// <summary>Absolute PNG path, or <see langword="null"/> for no icon.</summary>
        public string? IconPath { get; }

        /// <summary>Contextual-help URL, or <see langword="null"/> when the pack declared none.</summary>
        public string? HelpUrl { get; }
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
        private static readonly object _gate = new();
        private static readonly List<RibbonContribution> _contributions = [];

        /// <summary>
        /// Announces one ribbon button. Idempotent by <see cref="RibbonContribution.Name"/> —
        /// the first announcement wins — and safe to call from any thread.
        /// </summary>
        /// <param name="contribution">The button to announce. Must not be <see langword="null"/>.</param>
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
