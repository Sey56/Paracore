using System.Globalization;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using CoreScript.Engine.Core;
using CoreScript.Engine.Logging;
using CoreScript.Engine.Models;

// ⚠ Aliases instead of `using Autodesk.Revit.DB;` because that namespace defines Grid, Color and
// Panel, which collide with System.Windows.Controls and System.Windows.Media. Naming the two
// Revit types we actually touch is cheaper than disambiguating every WPF type.
using RvtDocument = Autodesk.Revit.DB.Document;
using RvtElement = Autodesk.Revit.DB.Element;
using MediaColor = System.Windows.Media.Color;
using WpfButton = System.Windows.Controls.Button;
using WpfPath = System.Windows.Shapes.Path;

namespace Paracore.PackSdk;

/// <summary>
/// A WPF form generated from <see cref="ScriptParameter"/> metadata.
///
/// The control choice follows <c>renderInput()</c> in
/// <c>rap-web/src/features/automation/components/ScriptInspector/ParameterInput.tsx</c>
/// in its exact dispatch order, because that is the front-end the customer already knows:
///
///   1. InputType File / Folder / SaveFile   → text box + Browse
///   2. options, single                       → Segmented radios, else ComboBox
///   3. MultiSelect                           → checkbox list: static when the options are known,
///                                              a Discover-filled checkbox DROPDOWN when they are not
///   4. type boolean                          → CheckBox
///   5. type number                           → Slider (when min+max), Stepper, else text
///   6. SelectionType Point                   → X / Y / Z boxes
///   7. InputType Color                       → hex box + swatch that opens a palette
///   8. IsRevitElement                        → ComboBox + Discover (mirrors RequiresCompute).
///                                              Covers Revit ENUMS too: the payload is the member
///                                              name instead of an element id
///   9. everything else                       → text box
///
/// ⚠ This class does NOT interpret the `_Options` / `_Visible` / `#region` conventions. The
/// engine's ParameterExtractor has already resolved them into Options / VisibleWhen / Group.
/// Two places interpreting the same convention is how the two front-ends drift apart.
/// </summary>
public sealed class ConfiguratorWindow : Window
{
    private readonly List<ScriptParameter> _parameters;
    private readonly Dictionary<string, object?> _values = [];
    private readonly List<ParamRow> _rows = [];
    private readonly List<GroupSection> _groups = [];
    private readonly Dictionary<string, System.Windows.Controls.Primitives.Popup> _panels = [];
    private readonly DiscoverProvider? _discover;
    private WpfButton? _runButton;

    /// <summary>
    /// The panels a control opens on demand, by parameter name — the colour palette and the
    /// multi-select list.
    ///
    /// ⚠ EXPOSED BECAUSE A POPUP IS NOT IN THE VISUAL TREE. It renders in its own window, so
    /// nothing that walks this window can reach it: not a render harness, not an automation
    /// driver, and not a pack that wants to open a panel as the form appears. This is the only
    /// handle there is.
    /// </summary>
    public IReadOnlyDictionary<string, System.Windows.Controls.Primitives.Popup> Panels => _panels;

    /// <summary>
    /// One collapsible group card. `#region` in the Params class becomes one of these.
    /// The chevron rotates from ">" to "v" when expanded, which is the affordance people expect
    /// from every tree view they already use.
    /// </summary>
    private sealed class GroupSection
    {
        public required string Name { get; init; }
        public required Border Container { get; init; }
        public required List<ScriptParameter> Parameters { get; init; }
        public required Action<bool> SetExpanded { get; init; }
    }
    private readonly RvtDocument _doc;

    private sealed class ParamRow
    {
        public required ScriptParameter P { get; init; }
        public required Grid Container { get; init; }
        public required Action<object?> Set { get; init; }
    }

    private sealed record Editor(FrameworkElement Element, Func<object?> Get, Action<object?> Set);

    public IReadOnlyDictionary<string, object?> Values => _values;

    /// <summary>True when this form's Run button asks for a rolled-back run.</summary>
    public bool DryRun { get; }

    /// <summary>
    /// The tool this form configures. Carried on the window rather than passed around: the run is
    /// queued from a click handler, and the results window and the log line both need it there.
    /// </summary>
    public string ToolName { get; }

    /// <summary>
    /// Raised when the user presses Run. ⚠ The window does NOT execute anything itself: a modeless
    /// window is outside the command's API context, so the host must queue the run on an
    /// <c>ExternalEvent</c>. Keeping that out of the window is what lets the window be tested with
    /// no Revit at all.
    /// </summary>
    public event Action? RunRequested;

    /// <summary>Locks the Run button while a run is queued or executing.</summary>
    public void SetRunning(bool running)
    {
        if (_runButton == null)
        {
            return;
        }

        _runButton.IsEnabled = !running;
        _runButton.Content = running ? "Running…" : RunLabel;
    }

    private string RunLabel => DryRun ? "Dry Run" : "Run";

    /// <summary>
    /// Sets a parameter as though the user had edited it — updates the control and re-evaluates
    /// every visibility condition. Needed to prefill a form from a previous run, and it is how
    /// the render harness exercises the <c>_Visible</c> rules without a mouse.
    /// </summary>
    public void SetValue(string name, object? value)
    {
        ParamRow? row = _rows.FirstOrDefault(r => r.P.Name == name);
        if (row == null)
        {
            return;
        }

        row.Set(value);
        Reevaluate();
    }

    /// <summary>
    /// Expands or collapses one group by its <c>#region</c> name. Useful for remembering the last
    /// state between runs, and for starting advanced groups collapsed.
    /// </summary>
    public void SetGroupExpanded(string groupName, bool expanded)
    {
        GroupSection? section = _groups.FirstOrDefault(
            g => string.Equals(g.Name, groupName, StringComparison.Ordinal));

        section?.SetExpanded(expanded);
    }

    public ConfiguratorWindow(
        string toolName,
        List<ScriptParameter> parameters,
        RvtDocument doc,
        bool dryRun = false,
        DiscoverProvider? discover = null)
    {
        _parameters = parameters;
        _doc = doc;
        _discover = discover;
        DryRun = dryRun;
        ToolName = toolName;

        Title = $"{toolName} — Parameters" + (dryRun ? " (dry run)" : "");

        // ⚠ MODELESS, not a dialog. A tool that blocks Revit until it is dismissed cannot be used
        // the way a Revit tool is used: look at the model, pick a room, look again. No Owner either —
        // an owned window stays above Revit forever, which is the opposite of non-blocking.
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        ShowInTaskbar = true;
        Width = 620;
        Height = 720;
        MinWidth = 520;
        MinHeight = 400;
        ResizeMode = ResizeMode.CanResize;
        Background = new SolidColorBrush(MediaColor.FromRgb(0xF8, 0xFA, 0xFC));

        foreach (ScriptParameter p in parameters)
        {
            _values[p.Name] = DefaultOf(p);
        }

        Content = BuildLayout(toolName, parameters);
        Reevaluate();
    }

    // ------------------------------------------------------------------ layout

    private UIElement BuildLayout(string toolName, List<ScriptParameter> parameters)
    {
        var root = new DockPanel();

        // Header
        var header = new Border
        {
            Background = new SolidColorBrush(MediaColor.FromRgb(0x1E, 0x29, 0x3B)),
            Padding = new Thickness(18, 14, 18, 14),
        };
        var headerStack = new StackPanel();
        headerStack.Children.Add(new TextBlock
        {
            Text = toolName,
            Foreground = Brushes.White,
            FontSize = 17,
            FontWeight = FontWeights.SemiBold,
        });
        int groups = parameters.Select(p => p.Group ?? "").Distinct().Count();
        headerStack.Children.Add(new TextBlock
        {
            Text = $"{parameters.Count} parameter(s) · {groups} group(s) · generated from the Params class",
            Foreground = new SolidColorBrush(MediaColor.FromRgb(0x94, 0xA3, 0xB8)),
            FontSize = 11.5,
            Margin = new Thickness(0, 3, 0, 0),
        });
        header.Child = headerStack;
        DockPanel.SetDock(header, Dock.Top);
        root.Children.Add(header);

        // Footer
        var footer = new Border
        {
            Background = Brushes.White,
            BorderBrush = new SolidColorBrush(MediaColor.FromRgb(0xE2, 0xE8, 0xF0)),
            BorderThickness = new Thickness(0, 1, 0, 0),
            Padding = new Thickness(14, 10, 14, 10),
        };
        var footerStack = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };

        var close = new WpfButton { Content = "Close", Width = 96, Height = 30, Margin = new Thickness(0, 0, 8, 0) };

        // ⚠ Close(), not DialogResult — a modeless window throws if you assign DialogResult.
        close.Click += (_, _) => Close();

        var run = new WpfButton
        {
            Content = RunLabel,
            Width = 118,
            Height = 30,
            IsDefault = true,
            Background = new SolidColorBrush(MediaColor.FromRgb(0x25, 0x63, 0xEB)),
            Foreground = Brushes.White,
            BorderBrush = new SolidColorBrush(MediaColor.FromRgb(0x25, 0x63, 0xEB)),
        };
        run.Click += (_, _) => RunRequested?.Invoke();
        _runButton = run;

        footerStack.Children.Add(close);
        footerStack.Children.Add(run);
        footer.Child = footerStack;
        DockPanel.SetDock(footer, Dock.Bottom);
        root.Children.Add(footer);

        // Body — one GroupBox per #region, in first-appearance order.
        var body = new StackPanel { Margin = new Thickness(14, 12, 14, 12) };

        foreach (var group in parameters.GroupBy(p => p.Group ?? ""))
        {
            string groupName = string.IsNullOrWhiteSpace(group.Key) ? "Parameters" : group.Key;

            var groupParameters = new List<ScriptParameter>();
            var rows = new StackPanel { Margin = new Thickness(12, 10, 12, 12) };

            foreach (ScriptParameter p in group)
            {
                rows.Children.Add(BuildRow(p));
                groupParameters.Add(p);
            }

            // Header: chevron + title. The whole strip is clickable, not just the arrow — a 9px
            // glyph is not a hit target.
            var chevron = new WpfPath
            {
                Data = Geometry.Parse("M 0,0 L 4.5,4.5 L 0,9"),
                Stroke = new SolidColorBrush(MediaColor.FromRgb(0x47, 0x55, 0x69)),
                StrokeThickness = 1.6,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap = PenLineCap.Round,
                StrokeLineJoin = PenLineJoin.Round,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0),
                RenderTransformOrigin = new Point(0.5, 0.5),
                RenderTransform = new RotateTransform(90), // ">" rotated 90° = "v"
            };

            var title = new TextBlock
            {
                Text = groupName,
                FontSize = 12.5,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(MediaColor.FromRgb(0x1E, 0x29, 0x3B)),
                VerticalAlignment = VerticalAlignment.Center,
            };

            var headerStrip = new StackPanel { Orientation = Orientation.Horizontal };
            headerStrip.Children.Add(chevron);
            headerStrip.Children.Add(title);

            var groupHeader = new Border
            {
                Background = new SolidColorBrush(MediaColor.FromRgb(0xF1, 0xF5, 0xF9)),
                Padding = new Thickness(12, 8, 12, 8),
                Cursor = System.Windows.Input.Cursors.Hand,
                Child = headerStrip,
                ToolTip = "Click to expand or collapse this group.",
            };

            var cardStack = new StackPanel();
            cardStack.Children.Add(groupHeader);
            cardStack.Children.Add(rows);

            var card = new Border
            {
                Margin = new Thickness(0, 0, 0, 10),
                Background = Brushes.White,
                BorderBrush = new SolidColorBrush(MediaColor.FromRgb(0xE2, 0xE8, 0xF0)),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(6),
                ClipToBounds = true,
                Child = cardStack,
            };

            body.Children.Add(card);

            bool expanded = true;
            void SetExpanded(bool value)
            {
                expanded = value;
                rows.Visibility = value ? Visibility.Visible : Visibility.Collapsed;
                chevron.RenderTransform = new RotateTransform(value ? 90 : 0);
            }

            groupHeader.MouseLeftButtonUp += (_, _) => SetExpanded(!expanded);

            // Remembered so Reevaluate can collapse a group whose every row is hidden. Without
            // this, "05. Randomization" renders as a titled empty box whenever PatternType is not
            // Random — visible in the first render of ParacoreTiler.
            _groups.Add(new GroupSection
            {
                Name = groupName,
                Container = card,
                Parameters = groupParameters,
                SetExpanded = SetExpanded,
            });
        }

        root.Children.Add(new ScrollViewer
        {
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
            Content = body,
        });

        return root;
    }

    private UIElement BuildRow(ScriptParameter p)
    {
        var grid = new Grid { Margin = new Thickness(0, 3, 0, 3) };
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(185) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        // Label: name + unit + required marker. The raw member name is shown on purpose — this
        // is a developer-facing probe, and matching the name to the C# property is the point.
        string label = p.Name;
        if (!string.IsNullOrEmpty(p.Suffix))
        {
            label += $" ({p.Suffix})";
        }

        if (p.Required)
        {
            label += " *";
        }

        var labelBlock = new TextBlock
        {
            Text = label,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(0, 0, 10, 0),
            TextTrimming = TextTrimming.CharacterEllipsis,
            Foreground = new SolidColorBrush(MediaColor.FromRgb(0x33, 0x41, 0x55)),
        };

        if (!string.IsNullOrWhiteSpace(p.Description))
        {
            labelBlock.ToolTip = p.Description;
        }

        Grid.SetColumn(labelBlock, 0);
        grid.Children.Add(labelBlock);

        Editor editor = CreateEditor(p);
        Grid.SetColumn(editor.Element, 1);
        grid.Children.Add(editor.Element);

        _rows.Add(new ParamRow { P = p, Container = grid, Set = editor.Set });
        return grid;
    }

    // ------------------------------------------------------------- control factory

    private Editor CreateEditor(ScriptParameter p)
    {
        // 1. File / Folder / SaveFile -------------------------------------------------
        if (p.InputType is "File" or "Folder" or "SaveFile")
        {
            var row = new DockPanel();
            var tb = new TextBox { Text = AsText(_values[p.Name]), Height = 26, VerticalContentAlignment = VerticalAlignment.Center };
            var browse = new WpfButton { Content = "Browse…", Width = 82, Height = 26, Margin = new Thickness(6, 0, 0, 0) };

            browse.Click += (_, _) =>
            {
                string? chosen = null;
                string filter = BuildFilter(p.Filter);

                if (p.InputType == "Folder")
                {
                    var dlg = new Microsoft.Win32.OpenFolderDialog { Title = p.Description };
                    if (dlg.ShowDialog() == true) chosen = dlg.FolderName;
                }
                else if (p.InputType == "SaveFile")
                {
                    var dlg = new Microsoft.Win32.SaveFileDialog { Filter = filter, Title = p.Description };
                    if (dlg.ShowDialog() == true) chosen = dlg.FileName;
                }
                else
                {
                    var dlg = new Microsoft.Win32.OpenFileDialog { Filter = filter, Title = p.Description };
                    if (dlg.ShowDialog() == true) chosen = dlg.FileName;
                }

                if (chosen != null)
                {
                    tb.Text = chosen;
                    _values[p.Name] = chosen;
                    Reevaluate();
                }
            };

            DockPanel.SetDock(browse, Dock.Right);
            row.Children.Add(browse);
            row.Children.Add(tb);

            tb.TextChanged += (_, _) => { _values[p.Name] = tb.Text; Reevaluate(); };
            return new Editor(row, () => _values[p.Name], v => { _values[p.Name] = v; tb.Text = AsText(v); });
        }

        // 2. Options, single selection ------------------------------------------------
        if (p.Options.Count > 0 && !p.MultiSelect)
        {
            if (p.InputType == "Segmented")
            {
                var wrap = new WrapPanel();
                var buttons = new List<RadioButton>();
                foreach (string option in p.Options)
                {
                    var rb = new RadioButton
                    {
                        Content = option,
                        GroupName = p.Name,
                        Margin = new Thickness(0, 2, 14, 2),
                        IsChecked = string.Equals(AsText(_values[p.Name]), option, StringComparison.Ordinal),
                    };
                    rb.Checked += (_, _) => { _values[p.Name] = option; Reevaluate(); };
                    buttons.Add(rb);
                    wrap.Children.Add(rb);
                }

                return new Editor(wrap,
                    () => _values[p.Name],
                    v =>
                    {
                        _values[p.Name] = v;
                        foreach (RadioButton rb in buttons)
                        {
                            rb.IsChecked = string.Equals(AsText(v), AsText(rb.Content), StringComparison.Ordinal);
                        }
                    });
            }

            var combo = new ComboBox { Height = 26, VerticalContentAlignment = VerticalAlignment.Center };
            foreach (string option in p.Options)
            {
                combo.Items.Add(option);
            }

            combo.SelectedItem = p.Options.FirstOrDefault(o => o == AsText(_values[p.Name]));
            combo.SelectionChanged += (_, _) =>
            {
                if (combo.SelectedItem is string s)
                {
                    _values[p.Name] = s;
                    Reevaluate();
                }
            };

            return new Editor(combo, () => _values[p.Name], v => { _values[p.Name] = v; combo.SelectedItem = v as string; });
        }

        // 3. Multi-select -------------------------------------------------------------
        // ⚠ TWO shapes, and which one you get is decided by where the items come from:
        //   • the extractor already resolved a list (_Options, [Options(...)]) → static checkboxes;
        //   • a Revit element type with no list yet (List<ViewSheet>, List<Room>, …) → the same
        //     checkbox list, but filled by Discover.
        //
        // ⚠ This branch runs BEFORE `IsRevitElement` — in the desktop too (ParameterInput.tsx
        // checks `multiSelect` first, and that ordering is why its MultiSelectInput carries its
        // own Compute button). Here it used to fall into the static shape, which iterated an
        // EMPTY option list and drew a 1-px bordered nothing: that is the "TargetSheets has no
        // UI at all" report, and it is why the control looked absent rather than empty.
        if (p.MultiSelect)
        {
            return p.IsRevitElement && p.Options.Count == 0
                ? CreateElementMultiSelect(p)
                : CreateStaticMultiSelect(p);
        }

        // 4. Boolean ------------------------------------------------------------------
        if (p.Type == "boolean")
        {
            var cb = new CheckBox
            {
                IsChecked = _values[p.Name] is true,
                VerticalAlignment = VerticalAlignment.Center,
                Content = _values[p.Name] is true ? "On" : "Off",
            };
            cb.Checked += (_, _) => { _values[p.Name] = true; cb.Content = "On"; Reevaluate(); };
            cb.Unchecked += (_, _) => { _values[p.Name] = false; cb.Content = "Off"; Reevaluate(); };
            return new Editor(cb, () => _values[p.Name], v =>
            {
                _values[p.Name] = v;
                cb.IsChecked = v is true;
                cb.Content = v is true ? "On" : "Off";
            });
        }

        // 5. Number -------------------------------------------------------------------
        if (p.Type == "number")
        {
            double current = ToDouble(_values[p.Name]);

            // 5a. min + max → Slider, exactly as the desktop does when both are present.
            if (p.Min.HasValue && p.Max.HasValue && p.Max > p.Min)
            {
                var row = new DockPanel();
                var slider = new Slider
                {
                    Minimum = p.Min.Value,
                    Maximum = p.Max.Value,
                    Value = current,
                    TickFrequency = p.Step ?? 1,
                    IsSnapToTickEnabled = p.Step.HasValue,
                    VerticalAlignment = VerticalAlignment.Center,
                    SmallChange = p.Step ?? 1,
                    LargeChange = (p.Step ?? 1) * 5,
                };
                var valueBox = new TextBox
                {
                    Text = current.ToString("0.###", CultureInfo.InvariantCulture),
                    Width = 74,
                    Height = 26,
                    Margin = new Thickness(8, 0, 0, 0),
                    TextAlignment = TextAlignment.Right,
                    VerticalContentAlignment = VerticalAlignment.Center,
                };

                bool syncing = false;
                slider.ValueChanged += (_, e) =>
                {
                    if (syncing) return;
                    syncing = true;
                    valueBox.Text = e.NewValue.ToString("0.###", CultureInfo.InvariantCulture);
                    _values[p.Name] = e.NewValue;
                    syncing = false;
                    Reevaluate();
                };
                valueBox.TextChanged += (_, _) =>
                {
                    if (syncing) return;
                    if (double.TryParse(valueBox.Text, NumberStyles.Any, CultureInfo.InvariantCulture, out double parsed))
                    {
                        syncing = true;
                        slider.Value = Math.Clamp(parsed, p.Min.Value, p.Max.Value);
                        _values[p.Name] = parsed;
                        syncing = false;
                        Reevaluate();
                    }
                };

                DockPanel.SetDock(valueBox, Dock.Right);
                row.Children.Add(valueBox);
                row.Children.Add(slider);

                return new Editor(row, () => _values[p.Name], v =>
                {
                    _values[p.Name] = v;
                    double d = ToDouble(v);
                    syncing = true;
                    slider.Value = Math.Clamp(d, p.Min.Value, p.Max.Value);
                    valueBox.Text = d.ToString("0.###", CultureInfo.InvariantCulture);
                    syncing = false;
                });
            }

            // 5b. Stepper → text box flanked by two repeat buttons.
            if (p.InputType == "Stepper")
            {
                var row = new DockPanel();
                var tb = new TextBox
                {
                    Text = current.ToString("0.###", CultureInfo.InvariantCulture),
                    Height = 26,
                    TextAlignment = TextAlignment.Center,
                    VerticalContentAlignment = VerticalAlignment.Center,
                };
                double step = p.Step ?? 1;
                var minus = new WpfButton { Content = "−", Width = 30, Height = 26 };
                var plus = new WpfButton { Content = "+", Width = 30, Height = 26, Margin = new Thickness(4, 0, 0, 0) };

                minus.Click += (_, _) =>
                {
                    double d = ToDouble(_values[p.Name]) - step;
                    _values[p.Name] = d;
                    tb.Text = d.ToString("0.###", CultureInfo.InvariantCulture);
                    Reevaluate();
                };
                plus.Click += (_, _) =>
                {
                    double d = ToDouble(_values[p.Name]) + step;
                    _values[p.Name] = d;
                    tb.Text = d.ToString("0.###", CultureInfo.InvariantCulture);
                    Reevaluate();
                };

                tb.TextChanged += (_, _) =>
                {
                    if (double.TryParse(tb.Text, NumberStyles.Any, CultureInfo.InvariantCulture, out double parsed))
                    {
                        _values[p.Name] = parsed;
                        Reevaluate();
                    }
                };

                DockPanel.SetDock(minus, Dock.Left);
                DockPanel.SetDock(plus, Dock.Right);
                row.Children.Add(minus);
                row.Children.Add(plus);
                row.Children.Add(tb);

                return new Editor(row, () => _values[p.Name], v =>
                {
                    _values[p.Name] = v;
                    tb.Text = ToDouble(v).ToString("0.###", CultureInfo.InvariantCulture);
                });
            }

            // 5c. Plain numeric text box.
            var plain = new TextBox
            {
                Text = current.ToString("0.###", CultureInfo.InvariantCulture),
                Height = 26,
                VerticalContentAlignment = VerticalAlignment.Center,
            };
            plain.TextChanged += (_, _) =>
            {
                if (double.TryParse(plain.Text, NumberStyles.Any, CultureInfo.InvariantCulture, out double parsed))
                {
                    _values[p.Name] = parsed;
                    Reevaluate();
                }
            };

            return new Editor(plain, () => _values[p.Name], v =>
            {
                _values[p.Name] = v;
                plain.Text = ToDouble(v).ToString("0.###", CultureInfo.InvariantCulture);
            });
        }

        // 6. Point --------------------------------------------------------------------
        if (string.Equals(p.SelectionType, "Point", StringComparison.OrdinalIgnoreCase))
        {
            var row = new StackPanel { Orientation = Orientation.Horizontal };
            string[] xyz = AsText(_values[p.Name]).Split(',');
            var boxes = new List<TextBox>();

            for (int i = 0; i < 3; i++)
            {
                string axis = i == 0 ? "X" : i == 1 ? "Y" : "Z";
                var tb = new TextBox
                {
                    Width = 92,
                    Height = 26,
                    Margin = new Thickness(0, 0, 6, 0),
                    Text = i < xyz.Length ? xyz[i].Trim() : "0",
                    VerticalContentAlignment = VerticalAlignment.Center,
                };
                tb.TextChanged += (_, _) =>
                {
                    _values[p.Name] = string.Join(",", boxes.Select(b => b.Text));
                    Reevaluate();
                };
                boxes.Add(tb);
                row.Children.Add(new TextBlock
                {
                    Text = axis,
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(0, 0, 4, 0),
                    Foreground = new SolidColorBrush(MediaColor.FromRgb(0x64, 0x74, 0x8B)),
                });
                row.Children.Add(tb);
            }

            return new Editor(row, () => _values[p.Name], v =>
            {
                _values[p.Name] = v;
                string[] parts = AsText(v).Split(',');
                for (int i = 0; i < boxes.Count; i++)
                {
                    boxes[i].Text = i < parts.Length ? parts[i].Trim() : "0";
                }
            });
        }

        // 7. Color --------------------------------------------------------------------
        // ⚠ WPF HAS NO NATIVE COLOUR PICKER. The desktop's ColorInput.tsx is an <input
        // type="color">, which the BROWSER draws; there is no WPF equivalent, and
        // System.Windows.Forms.ColorDialog would drag WinForms into a Revit add-in for one
        // control. So the swatch opens a panel this SDK draws itself — see ColorSwatchPicker:
        // a saturation/value square and a hue strip you DRAG, plus a grid of fixed swatches.
        //
        // ⚠ The swatch used to be a Border with NO click handler at all: it rendered, and
        // clicking it did nothing. It also started TRANSPARENT, because the background was only
        // ever assigned from TextChanged — and the initial `Text = ...` is set before the
        // subscription, so that event never fires.
        if (p.InputType == "Color")
        {
            var row = new DockPanel();
            var tb = new TextBox
            {
                Text = AsText(_values[p.Name]),
                Height = 26,
                VerticalContentAlignment = VerticalAlignment.Center,
            };
            var swatch = new Border
            {
                Width = 30,
                Height = 26,
                Margin = new Thickness(6, 0, 0, 0),
                BorderBrush = new SolidColorBrush(MediaColor.FromRgb(0xD8, 0xDF, 0xE8)),
                BorderThickness = new Thickness(1),
                Cursor = System.Windows.Input.Cursors.Hand,
                ToolTip = "Click to pick a colour.",
                Background = BrushFromHex(AsText(_values[p.Name])),
            };

            // ⚠ The panel writes into the TEXT BOX rather than into _values, so ONE code path owns
            // the value: picking a colour is indistinguishable from typing one.
            //
            // ⚠ The popup is built FIRST because the picker needs a way to dismiss it: a click on
            // a fixed swatch is a complete choice, a drag is not (the panel must stay open while
            // the user is still adjusting).
            var palette = new System.Windows.Controls.Primitives.Popup
            {
                PlacementTarget = swatch,
                Placement = System.Windows.Controls.Primitives.PlacementMode.Bottom,
                StaysOpen = false,
            };

            var picker = new ColorSwatchPicker(
                AsText(_values[p.Name]),
                hex => tb.Text = hex,
                () => palette.IsOpen = false);

            palette.Child = new Border
            {
                Background = Brushes.White,
                BorderBrush = new SolidColorBrush(MediaColor.FromRgb(0xC8, 0xD2, 0xDF)),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(6),
                Child = picker.Root,
            };

            _panels[p.Name] = palette;
            swatch.MouseLeftButtonUp += (_, _) => palette.IsOpen = true;

            tb.TextChanged += (_, _) =>
            {
                _values[p.Name] = tb.Text;
                swatch.Background = BrushFromHex(tb.Text);
                picker.Sync(tb.Text); // typing #1B6E4A moves the thumbs there
                Reevaluate();
            };

            DockPanel.SetDock(swatch, Dock.Right);
            row.Children.Add(swatch);
            row.Children.Add(tb);
            return new Editor(row, () => _values[p.Name], v => { _values[p.Name] = v; tb.Text = AsText(v); });
        }

        // 8. Revit element → ComboBox filled on demand (mirrors RequiresCompute) --------
        // ⚠ The value carried is the ELEMENT ID, not the name. Names are not unique ("Kitchen"
        // exists on every floor), and the engine resolves a numeric identifier directly
        // (RevitObjectResolver TIER 2: `long.TryParse` → `GetElement(new ElementId(id))`).
        //
        // ⚠⚠ AN ENUM IS THE SAME CONTROL WITH A DIFFERENT PAYLOAD. BuiltInCategory /
        // BuiltInParameter arrive here as `isRevitElement` with the enum's name as the "element
        // type"; Discover returns the enum's members and the value is the member NAME, which is
        // what ParameterHydrator's `Enum.TryParse` reads. Same combo, same button, one extra
        // field on ElementChoice — see ParameterDiscovery, which is where the two pools split.
        //
        // ⚠⚠ NOTHING IS QUERIED WHEN THE FORM OPENS. Filling four element lists up front means four
        // model-wide collectors before the user has decided anything — slow on a real model, and it
        // is the desktop's behaviour too: there, "Compute" is a button, not a side effect.
        if (p.IsRevitElement && p.Options.Count == 0)
        {
            var row = new DockPanel();

            var combo = new ComboBox
            {
                Height = 26,
                VerticalContentAlignment = VerticalAlignment.Center,
                IsEditable = false,
                DisplayMemberPath = nameof(ElementChoice.Label),
            };

            // An empty combo with no explanation is indistinguishable from a broken one. The
            // watermark says what to do, and after a Discover it says what happened.
            var watermark = new TextBlock
            {
                Text = _discover == null ? "no discovery provider" : "click Discover",
                IsHitTestVisible = false,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(9, 0, 0, 0),
                FontSize = 12,
                Foreground = new SolidColorBrush(MediaColor.FromRgb(0x94, 0xA3, 0xB8)),
            };

            var comboHost = new Grid();
            comboHost.Children.Add(combo);
            comboHost.Children.Add(watermark);

            WpfButton discover = CreateDiscoverButton(p, (items, error) =>
            {
                // Read BEFORE the items are replaced — this is the only place the old selection
                // still exists.
                object? previous = (combo.SelectedItem as ElementChoice)?.Payload;

                combo.Items.Clear();
                foreach (ElementChoice choice in items)
                {
                    combo.Items.Add(choice);
                }

                if (previous != null)
                {
                    ElementChoice? match = combo.Items.Cast<ElementChoice>()
                        .FirstOrDefault(c => c.Payload.Equals(previous));

                    if (match != null)
                    {
                        combo.SelectedItem = match;
                    }
                }

                watermark.Text = error
                    ?? (items.Count == 0 ? $"no {p.RevitElementType ?? "element"} found" : "");
                watermark.Visibility = items.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
            });

            combo.SelectionChanged += (_, _) =>
            {
                if (combo.SelectedItem is ElementChoice choice)
                {
                    _values[p.Name] = choice.Payload;
                    Reevaluate();
                }
            };

            DockPanel.SetDock(discover, Dock.Right);
            row.Children.Add(discover);
            row.Children.Add(comboHost);

            return new Editor(row, () => _values[p.Name], v =>
            {
                _values[p.Name] = v;

                ElementChoice? match = v == null
                    ? null
                    : combo.Items.Cast<ElementChoice>().FirstOrDefault(c => c.Payload.Equals(v));

                if (match != null)
                {
                    combo.SelectedItem = match;
                    watermark.Visibility = Visibility.Collapsed;
                }
            });
        }

        // 9. Everything else → text box -----------------------------------------------
        var text = new TextBox
        {
            Text = AsText(_values[p.Name]),
            Height = 26,
            VerticalContentAlignment = VerticalAlignment.Center,
        };
        text.TextChanged += (_, _) => { _values[p.Name] = text.Text; Reevaluate(); };
        return new Editor(text, () => _values[p.Name], v => { _values[p.Name] = v; text.Text = AsText(v); });
    }

    // -------------------------------------------------- multi-select (two shapes)

    /// <summary>
    /// Checkboxes over a list the extractor already resolved. No Discover button: the options came
    /// from the script's own <c>_Options</c> / <c>[Options(...)]</c>, so there is nothing to query.
    /// </summary>
    private Editor CreateStaticMultiSelect(ScriptParameter p)
    {
        var panel = new StackPanel();
        var boxes = new List<CheckBox>();
        var selected = _values[p.Name] as List<string> ?? [];

        foreach (string option in p.Options)
        {
            var cb = new CheckBox
            {
                Content = option,
                Margin = new Thickness(0, 1, 0, 1),
                IsChecked = selected.Contains(option),
            };
            cb.Checked += (_, _) => SyncMulti();
            cb.Unchecked += (_, _) => SyncMulti();
            boxes.Add(cb);
            panel.Children.Add(cb);
        }

        void SyncMulti()
        {
            _values[p.Name] = boxes.Where(b => b.IsChecked == true).Select(b => AsText(b.Content)).ToList();
            Reevaluate();
        }

        var scroll = new ScrollViewer
        {
            MaxHeight = 120,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            Content = panel,
            BorderBrush = new SolidColorBrush(MediaColor.FromRgb(0xD8, 0xDF, 0xE8)),
            BorderThickness = new Thickness(1),
            Padding = new Thickness(6, 4, 6, 4),
        };

        return new Editor(scroll, () => _values[p.Name], v =>
        {
            _values[p.Name] = v;
            var list = v as List<string> ?? [];
            foreach (CheckBox cb in boxes)
            {
                cb.IsChecked = list.Contains(AsText(cb.Content));
            }
        });
    }

    /// <summary>
    /// A checkbox dropdown whose items arrive from Discover — the pack's port of the desktop's
    /// MultiSelectInput: a filter box, the Compute button, one checkbox per row, All/None, and a
    /// live count.
    ///
    /// The COLLAPSED control reports how many are ticked. A dropdown that says only "Select…" is
    /// indistinguishable from one that never loaded — the same confusion the single-select
    /// combo's watermark exists to prevent.
    /// </summary>
    private Editor CreateElementMultiSelect(ScriptParameter p)
    {
        var row = new DockPanel();

        var items = new List<ElementChoice>();
        var picked = new HashSet<string>(StringComparer.Ordinal);

        var toggle = new System.Windows.Controls.Primitives.ToggleButton
        {
            Height = 26,
            Padding = new Thickness(9, 0, 6, 0),
            HorizontalContentAlignment = HorizontalAlignment.Left,
            VerticalContentAlignment = VerticalAlignment.Center,
            Content = "Select…",
            ToolTip = $"Click Discover to list every {p.RevitElementType ?? "element"}, then tick the ones you want.",
        };

        var list = new StackPanel();

        var filterBox = new TextBox { Height = 24, VerticalContentAlignment = VerticalAlignment.Center };
        var filterHint = new TextBlock
        {
            Text = "filter the list…",
            IsHitTestVisible = false,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(7, 0, 0, 0),
            FontSize = 12,
            Foreground = new SolidColorBrush(MediaColor.FromRgb(0x94, 0xA3, 0xB8)),
        };
        var filterHost = new Grid { Margin = new Thickness(0, 0, 0, 4) };
        filterHost.Children.Add(filterBox);
        filterHost.Children.Add(filterHint);

        var all = new WpfButton { Content = "All", Width = 44, Height = 22, Margin = new Thickness(4, 0, 0, 0) };
        var none = new WpfButton { Content = "None", Width = 50, Height = 22, Margin = new Thickness(4, 0, 0, 0) };

        var header = new DockPanel { Margin = new Thickness(0, 0, 0, 4) };
        DockPanel.SetDock(all, Dock.Right);
        DockPanel.SetDock(none, Dock.Right);
        header.Children.Add(all);
        header.Children.Add(none);
        header.Children.Add(filterHost);

        var scroller = new ScrollViewer
        {
            Height = 208,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
            BorderBrush = new SolidColorBrush(MediaColor.FromRgb(0xE2, 0xE8, 0xF0)),
            BorderThickness = new Thickness(1),
            Padding = new Thickness(4, 2, 4, 2),
            Content = list,
        };

        var body = new DockPanel();
        DockPanel.SetDock(header, Dock.Top);
        body.Children.Add(header);
        body.Children.Add(scroller);

        // ⚠ No AllowsTransparency: a layered popup can render as a black rectangle on some
        // drivers, and this window lives inside Revit. A plain bordered panel is the safe shape.
        var popup = new System.Windows.Controls.Primitives.Popup
        {
            PlacementTarget = toggle,
            Placement = System.Windows.Controls.Primitives.PlacementMode.Bottom,
            StaysOpen = false,
            Width = 356,
            Child = new Border
            {
                Background = Brushes.White,
                BorderBrush = new SolidColorBrush(MediaColor.FromRgb(0xC8, 0xD2, 0xDF)),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(6),
                Child = body,
            },
        };

        List<ElementChoice> Shown()
        {
            string term = filterBox.Text?.Trim() ?? "";
            return term.Length == 0
                ? items
                : items.Where(c => c.Label.Contains(term, StringComparison.OrdinalIgnoreCase)).ToList();
        }

        void RefreshLabel()
        {
            toggle.Content = picked.Count == 0
                ? (items.Count == 0 ? "Select…" : "none selected")
                : $"{picked.Count} selected";
        }

        // ⚠ The TICKS are the value: every payload is re-derived from `picked`, so an id that is
        // no longer in the list drops out. That is right once the user is choosing — and it is
        // why Editor.Set below does NOT come through here: a prefilled value has to survive until
        // Discover has listed the items it points at.
        void Publish()
        {
            _values[p.Name] = items
                .Where(c => picked.Contains(KeyOf(c)))
                .Select(c => c.Payload)
                .ToList();

            RefreshLabel();
            Reevaluate();
        }

        void Rebuild()
        {
            list.Children.Clear();

            var hint = new TextBlock
            {
                FontSize = 11.5,
                FontStyle = FontStyles.Italic,
                Margin = new Thickness(3, 6, 3, 6),
                Foreground = new SolidColorBrush(MediaColor.FromRgb(0x94, 0xA3, 0xB8)),
            };

            if (items.Count == 0)
            {
                hint.Text = "nothing listed yet — press Discover";
                list.Children.Add(hint);
                return;
            }

            List<ElementChoice> shown = Shown();
            if (shown.Count == 0)
            {
                hint.Text = $"nothing matches \"{filterBox.Text?.Trim()}\"";
                list.Children.Add(hint);
                return;
            }

            foreach (ElementChoice choice in shown)
            {
                var cb = new CheckBox
                {
                    Content = choice.Label,
                    IsChecked = picked.Contains(KeyOf(choice)),
                    Margin = new Thickness(0, 1, 0, 1),
                    Tag = choice,
                };
                cb.Checked += (_, _) => { picked.Add(KeyOf((ElementChoice)cb.Tag)); Publish(); };
                cb.Unchecked += (_, _) => { picked.Remove(KeyOf((ElementChoice)cb.Tag)); Publish(); };
                list.Children.Add(cb);
            }
        }

        all.Click += (_, _) =>
        {
            foreach (ElementChoice choice in Shown())
            {
                picked.Add(KeyOf(choice));
            }

            Publish();
            Rebuild();
        };

        none.Click += (_, _) =>
        {
            foreach (ElementChoice choice in Shown())
            {
                picked.Remove(KeyOf(choice));
            }

            Publish();
            Rebuild();
        };

        filterBox.TextChanged += (_, _) =>
        {
            filterHint.Visibility = string.IsNullOrEmpty(filterBox.Text) ? Visibility.Visible : Visibility.Collapsed;
            Rebuild();
        };

        toggle.Click += (_, _) => popup.IsOpen = toggle.IsChecked == true;
        popup.Closed += (_, _) => toggle.IsChecked = false;
        _panels[p.Name] = popup;

        WpfButton discover = CreateDiscoverButton(p, (found, _) =>
        {
            items.Clear();
            items.AddRange(found);
            Rebuild();
            Publish();
        });

        DockPanel.SetDock(discover, Dock.Right);
        row.Children.Add(discover);
        row.Children.Add(toggle);

        Rebuild();

        return new Editor(row, () => _values[p.Name], v =>
        {
            // A prefilled value only means something once Discover has listed the items, so the
            // ticks are held by KEY and re-applied by Rebuild.
            _values[p.Name] = v;
            picked.Clear();

            if (v is System.Collections.IEnumerable sequence && v is not string)
            {
                foreach (object? item in sequence)
                {
                    string? key = item switch
                    {
                        long id => id.ToString(CultureInfo.InvariantCulture),
                        string s => s,
                        null => null,
                        _ => item.ToString(),
                    };

                    if (key != null)
                    {
                        picked.Add(key);
                    }
                }
            }

            Rebuild();
            RefreshLabel();
            Reevaluate();
        });
    }

    /// <summary>
    /// The Discover button, shared by the single- and multi-select element controls.
    ///
    /// ⚠ ONE implementation on purpose: the count on the button plus the sentence underneath is
    /// the only thing that separates a Discover that found nothing from one that never ran, and
    /// two copies of that feedback would drift apart exactly like the two front-ends did.
    /// </summary>
    private WpfButton CreateDiscoverButton(ScriptParameter p, Action<List<ElementChoice>, string?> onFilled)
    {
        var button = new WpfButton
        {
            Content = "Discover",
            Width = 96,
            Height = 26,
            Margin = new Thickness(6, 0, 0, 0),
            ToolTip = $"Lists every {p.RevitElementType ?? "element"} in the model.",
        };

        if (_discover == null)
        {
            button.IsEnabled = false;
            button.ToolTip = "no discovery provider";
            return button;
        }

        async void Fill()
        {
            button.IsEnabled = false;
            button.Content = "searching…";

            try
            {
                // The CURRENT values, snapshotted: an _Options provider may read other parameters,
                // and the desktop's Compute re-evaluates against what is on screen right now.
                var snapshot = new Dictionary<string, object?>(_values);
                (List<ElementChoice> items, string? error) = await _discover!(p, snapshot);

                // The count is the feedback: a Discover that changes nothing used to be
                // indistinguishable from a Discover that never ran.
                button.Content = items.Count == 0 ? "Discover" : $"Discover ({items.Count})";
                onFilled(items, error);
            }
            catch (Exception ex)
            {
                button.Content = "Discover";
                onFilled([], ex.Message);
            }
            finally
            {
                button.IsEnabled = true;
            }
        }

        button.Click += (_, _) => Fill();
        return button;
    }

    /// <summary>
    /// Identity of a choice across a rebuild: the enum NAME, or the element ID as text. Never the
    /// label — labels repeat, and a rebuild would then tick the wrong row.
    /// </summary>
    private static string KeyOf(ElementChoice choice) =>
        choice.EnumName ?? choice.Id.ToString(CultureInfo.InvariantCulture);

    // ------------------------------------------------------------------ behaviour

    /// <summary>
    /// Re-applies every visibility and enabled condition. Called on every edit, which is what the
    /// desktop does — the conditions are cheap and a stale form is worse than a redundant pass.
    /// </summary>
    private void Reevaluate()
    {
        foreach (ParamRow row in _rows)
        {
            bool visible = ParamVisibility.IsVisible(row.P, _values);
            row.Container.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;

            if (visible)
            {
                row.Container.IsEnabled = ParamVisibility.IsEnabled(row.P, _values);
            }
        }

        // A group with no visible row collapses entirely — an empty titled box is noise.
        foreach (GroupSection section in _groups)
        {
            bool anyVisible = section.Parameters.Any(p => ParamVisibility.IsVisible(p, _values));
            section.Container.Visibility = anyVisible ? Visibility.Visible : Visibility.Collapsed;
        }
    }

    // ------------------------------------------------------------------ helpers

    private static string AsText(object? value) => value switch
    {
        null => "",
        bool b => b ? "true" : "false",
        double d => d.ToString("0.###", CultureInfo.InvariantCulture),
        List<string> list => string.Join(", ", list),
        _ => value.ToString() ?? "",
    };

    private static double ToDouble(object? value) => value switch
    {
        double d => d,
        int i => i,
        string s when double.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out double p) => p,
        _ => 0d,
    };

    /// <summary>Reads the extractor's <c>DefaultValueJson</c> back into a live value.</summary>
    private static object? DefaultOf(ScriptParameter p)
    {
        string json = p.DefaultValueJson;

        try
        {
            if (p.Type == "boolean")
            {
                return json.Trim().Equals("true", StringComparison.OrdinalIgnoreCase);
            }

            if (p.Type == "number")
            {
                return double.TryParse(json, NumberStyles.Any, CultureInfo.InvariantCulture, out double d) ? d : 0d;
            }

            if (p.MultiSelect)
            {
                return JsonSerializer.Deserialize<List<string>>(json) ?? [];
            }

            if (json is "null" or "" or "\"\"")
            {
                return p.Type == "reference" ? null : "";
            }

            return JsonSerializer.Deserialize<string>(json) ?? "";
        }
        catch
        {
            return p.Type == "number" ? 0d : "";
        }
    }

    private static string BuildFilter(string? filter)
    {
        if (string.IsNullOrWhiteSpace(filter))
        {
            return "All files|*.*";
        }

        string[] extensions = filter.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        string pattern = string.Join(";", extensions.Select(e => "*." + e.TrimStart('*', '.')));
        return $"{filter.Replace(",", ", ")}|{pattern}|All files|*.*";
    }

    /// <summary>Hex (or any WPF colour name) to a brush; transparent when it does not parse.</summary>
    private static Brush BrushFromHex(string? hex)
    {
        if (string.IsNullOrWhiteSpace(hex))
        {
            return Brushes.Transparent;
        }

        try
        {
            return new SolidColorBrush((MediaColor)ColorConverter.ConvertFromString(hex));
        }
        catch
        {
            // A half-typed hex ("#3B8") is the normal case while the user is editing, not an error.
            return Brushes.Transparent;
        }
    }

    /// <summary>
    /// Resolves a Revit type name to a <see cref="Type"/>. Room lives in
    /// <c>Autodesk.Revit.DB.Architecture</c> while FloorType lives in <c>Autodesk.Revit.DB</c>, so
    /// both namespaces are probed before falling back to a scan of the loaded assemblies.
    /// </summary>
    public static Type? ResolveElementType(string? typeName)
    {
        if (string.IsNullOrWhiteSpace(typeName))
        {
            return null;
        }

        foreach (string ns in new[] { "Autodesk.Revit.DB.", "Autodesk.Revit.DB.Architecture.", "Autodesk.Revit.DB.Structure." })
        {
            Type? direct = Type.GetType(ns + typeName + ", RevitAPI");
            if (direct != null)
            {
                return direct;
            }
        }

        foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
        {
            try
            {
                Type? found = asm.GetTypes().FirstOrDefault(t =>
                    t.Name == typeName && typeof(RvtElement).IsAssignableFrom(t));
                if (found != null)
                {
                    return found;
                }
            }
            catch
            {
                // Some assemblies throw on GetTypes(); skip them.
            }
        }

        return null;
    }

    /// <summary>
    /// Fills an element parameter on demand — the "Compute" button.
    ///
    /// ⚠ The window does NOT collect anything. Discovery belongs to the ENGINE, which owns the two
    /// conventions that make a list correct: <c>{Name}_Options</c> providers and <c>{Name}_Filter</c>
    /// predicates (<c>ParameterOptionsExecutor</c>), plus the automatic type lookup with its
    /// SpatialElement quirk (<c>ParameterOptionsComputer</c>). Hand-writing a
    /// <c>FilteredElementCollector</c> here would be a second implementation of a solved problem —
    /// and the one thing the pack route exists to prevent.
    ///
    /// The values are passed in because an <c>_Options</c> provider may read other parameters.
    /// </summary>
    public delegate Task<(List<ElementChoice> Items, string? Error)> DiscoverProvider(
        ScriptParameter parameter,
        IReadOnlyDictionary<string, object?> values);
}

/// <summary>
/// One selectable item. <see cref="Payload"/> is what travels to the engine; <see cref="Label"/>
/// is what the user reads. Keeping both is the point — a name alone cannot identify a room.
///
/// ⚠ TWO KINDS OF ITEM, ONE TYPE:
///   • an ELEMENT — <see cref="Id"/> is the Revit id, and the resolver's numeric tier
///     (<c>long.TryParse</c> → <c>GetElement(new ElementId(id))</c>) reads it;
///   • an ENUM member (BuiltInCategory, BuiltInParameter, …) — there is no element and no id, so
///     <see cref="EnumName"/> carries the member NAME and <c>ParameterHydrator</c>'s
///     <c>Enum.TryParse</c> reads it.
/// A second record for the enum case would mean a second combo, a second checkbox list and a
/// second value path — which is exactly how two front-ends drift apart.
/// </summary>
public sealed record ElementChoice(long Id, string Label, string? EnumName = null)
{
    /// <summary>What is stored in the form's values, and serialised to the engine.</summary>
    public object Payload => EnumName ?? (object)Id;
}
