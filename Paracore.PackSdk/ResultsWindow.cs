using System;
using System.Collections.Generic;
using System.Data;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using CoreScript.Engine.Core;
using MediaColor = System.Windows.Media.Color;
using WpfButton = System.Windows.Controls.Button;

namespace Paracore.PackSdk;

/// <summary>
/// The results surface a pack needs and the host does not provide.
///
/// A script prints through <c>ExecutionGlobals</c> → <c>ICoreScriptContext</c> → the desktop app's
/// Output panel. Revit has no such panel, so a pack tool that only shows a form runs, changes the
/// model, and says NOTHING. This window closes that gap: verdict, log, and every table the script
/// emitted.
///
/// ⚠ Charts are shown as their underlying data, not drawn. The desktop renders
/// <c>chart-bar</c> / <c>chart-pie</c> / <c>chart-line</c>; pretending to draw them here would be a
/// second renderer to keep in step with the first. The numbers are what a QS reads anyway.
/// </summary>
public sealed class ResultsWindow : Window
{
    private const int MaxRowsShown = 300;

    private readonly string _logText;
    private readonly RunReport _report;
    private readonly ExecutionResult _result;

    public ResultsWindow(string toolName, bool dryRun, TimeSpan elapsed, ExecutionResult result, RunReport report)
    {
        _result = result;
        _report = report;
        _logText = SanitizeLog(string.Join(Environment.NewLine, report.Log));

        Title = $"{toolName} — Result";
        Width = 860;
        Height = 620;
        MinWidth = 560;
        MinHeight = 360;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        ResizeMode = ResizeMode.CanResize;
        Background = new SolidColorBrush(MediaColor.FromRgb(0xF8, 0xFA, 0xFC));

        Content = Build(toolName, dryRun, elapsed, result);
    }

    private UIElement Build(string toolName, bool dryRun, TimeSpan elapsed, ExecutionResult result)
    {
        var root = new DockPanel();

        // ── Header ───────────────────────────────────────────────────────────────
        var header = new Border
        {
            Background = new SolidColorBrush(MediaColor.FromRgb(0x1E, 0x29, 0x3B)),
            Padding = new Thickness(18, 14, 18, 14),
        };

        var headerGrid = new Grid();
        headerGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        headerGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        var titles = new StackPanel();
        titles.Children.Add(new TextBlock
        {
            Text = dryRun ? $"{toolName} · dry run" : toolName,
            Foreground = Brushes.White,
            FontSize = 17,
            FontWeight = FontWeights.SemiBold,
        });

        var facts = new List<string>();

        // ⚠ "SUCCEEDED" is the wrong word for a dry run: it reads as "it did it", and the author then
        // goes looking for geometry that was deliberately rolled back. The verdict says what happened
        // to the MODEL, not whether the script was happy.
        if (dryRun && result.IsSuccess)
        {
            facts.Add("nothing was written to the model");
        }

        facts.Add($"{elapsed.TotalSeconds.ToString("0.0", CultureInfo.InvariantCulture)} s");
        facts.Add($"{_report.Log.Count} log line(s)");
        facts.Add($"{_report.Outputs.Count} output(s)");

        if (_report.PipelineDiagnostics.Count > 0)
        {
            facts.Add("pipeline " + string.Join(" → ", _report.PipelineDiagnostics.Select(FormatDiagnostic)));
        }

        titles.Children.Add(new TextBlock
        {
            Text = string.Join(" · ", facts),
            Foreground = new SolidColorBrush(MediaColor.FromRgb(0x94, 0xA3, 0xB8)),
            FontSize = 11.5,
            Margin = new Thickness(0, 3, 0, 0),
            TextWrapping = TextWrapping.Wrap,
        });

        Grid.SetColumn(titles, 0);
        headerGrid.Children.Add(titles);

        var chip = new Border
        {
            CornerRadius = new CornerRadius(11),
            Padding = new Thickness(12, 5, 12, 5),
            VerticalAlignment = VerticalAlignment.Top,
            Background = new SolidColorBrush(!result.IsSuccess
                ? MediaColor.FromRgb(0xDC, 0x26, 0x26)
                : dryRun
                    ? MediaColor.FromRgb(0xB4, 0x53, 0x09)
                    : MediaColor.FromRgb(0x16, 0xA3, 0x4A)),
        };
        chip.Child = new TextBlock
        {
            Text = !result.IsSuccess ? "FAILED" : dryRun ? "ROLLED BACK" : "SUCCEEDED",
            Foreground = Brushes.White,
            FontSize = 11,
            FontWeight = FontWeights.Bold,
        };
        Grid.SetColumn(chip, 1);
        headerGrid.Children.Add(chip);

        header.Child = headerGrid;
        DockPanel.SetDock(header, Dock.Top);
        root.Children.Add(header);

        // ── Footer ───────────────────────────────────────────────────────────────
        var footer = new Border
        {
            Background = Brushes.White,
            BorderBrush = new SolidColorBrush(MediaColor.FromRgb(0xE2, 0xE8, 0xF0)),
            BorderThickness = new Thickness(0, 1, 0, 0),
            Padding = new Thickness(14, 10, 14, 10),
        };

        var footerRow = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Right,
        };

        var copy = new WpfButton { Content = "Copy log", Width = 110, Height = 30, Margin = new Thickness(0, 0, 8, 0) };
        copy.Click += (_, _) => CopyLog();

        var close = new WpfButton
        {
            Content = "Close",
            Width = 96,
            Height = 30,
            IsDefault = true,
            IsCancel = true,
        };
        close.Click += (_, _) => Close();

        footerRow.Children.Add(copy);
        footerRow.Children.Add(close);
        footer.Child = footerRow;
        DockPanel.SetDock(footer, Dock.Bottom);
        root.Children.Add(footer);

        // ── Body ─────────────────────────────────────────────────────────────────
        var body = new StackPanel { Margin = new Thickness(14, 14, 14, 14) };

        if (!result.IsSuccess)
        {
            body.Children.Add(BuildErrorPanel(result));
        }

        body.Children.Add(BuildLogCard());

        foreach (StructuredItem item in _report.Outputs)
        {
            body.Children.Add(BuildOutputCard(item));
        }

        if (_report.Outputs.Count == 0 && result.IsSuccess)
        {
            body.Children.Add(Card(new TextBlock
            {
                Text = "The script finished without emitting a table or chart. If it was supposed to "
                     + "report something, it never called Println()/Table().",
                Foreground = new SolidColorBrush(MediaColor.FromRgb(0x64, 0x74, 0x8B)),
                FontSize = 12,
                TextWrapping = TextWrapping.Wrap,
            }));
        }

        var scroller = new ScrollViewer
        {
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
            Content = body,
        };

        root.Children.Add(scroller);
        return root;
    }

    // ------------------------------------------------------------------ pieces

    private static UIElement BuildErrorPanel(ExecutionResult result)
    {
        var stack = new StackPanel();

        stack.Children.Add(new TextBlock
        {
            Text = result.ErrorMessage,
            Foreground = new SolidColorBrush(MediaColor.FromRgb(0x99, 0x1B, 0x1B)),
            FontSize = 12.5,
            FontWeight = FontWeights.SemiBold,
            TextWrapping = TextWrapping.Wrap,
        });

        if (result.ErrorDetails.Length > 0)
        {
            stack.Children.Add(new TextBox
            {
                Text = string.Join(Environment.NewLine, result.ErrorDetails),
                IsReadOnly = true,
                BorderThickness = new Thickness(0),
                Background = Brushes.Transparent,
                FontFamily = new FontFamily("Consolas, Cascadia Mono, Courier New"),
                FontSize = 11.5,
                Foreground = new SolidColorBrush(MediaColor.FromRgb(0x7F, 0x1D, 0x1D)),
                Margin = new Thickness(0, 8, 0, 0),
                MaxHeight = 160,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                TextWrapping = TextWrapping.Wrap,
            });
        }

        return new Border
        {
            Background = new SolidColorBrush(MediaColor.FromRgb(0xFE, 0xF2, 0xF2)),
            BorderBrush = new SolidColorBrush(MediaColor.FromRgb(0xFE, 0xCA, 0xCA)),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8),
            Padding = new Thickness(14, 12, 14, 12),
            Margin = new Thickness(0, 0, 0, 12),
            Child = stack,
        };
    }

    private UIElement BuildLogCard()
    {
        var stack = new StackPanel();
        stack.Children.Add(SectionTitle("Log"));

        // ⚠ A TextBlock, not a TextBox. WPF's text formatter does per-glyph fallback on the TextBlock
        // path but NOT when a TextBox is given an explicit font family, so the engine's emoji came out
        // as tofu boxes in a TextBox. Selection is lost, which is why there is a Copy log button.
        var text = new TextBlock
        {
            Text = _logText.Length == 0 ? "(nothing printed)" : _logText,
            FontFamily = new FontFamily("Consolas, Cascadia Mono, Segoe UI Emoji, Segoe UI"),
            FontSize = 12,
            Foreground = new SolidColorBrush(MediaColor.FromRgb(0x1F, 0x29, 0x37)),
            TextWrapping = TextWrapping.Wrap,
            LineHeight = 18,
        };

        stack.Children.Add(new ScrollViewer
        {
            Content = text,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
            MaxHeight = 260,
        });

        return Card(stack);
    }

    private UIElement BuildOutputCard(StructuredItem item)
    {
        var stack = new StackPanel();
        string label = DescribeType(item.Type);

        DataTable? table = TryBuildTable(item.Json, out int totalRows, out string? note);

        if (table == null)
        {
            stack.Children.Add(SectionTitle(label));
            stack.Children.Add(new TextBlock
            {
                Text = note ?? "This output could not be read as rows.",
                Foreground = new SolidColorBrush(MediaColor.FromRgb(0x64, 0x74, 0x8B)),
                FontSize = 12,
                TextWrapping = TextWrapping.Wrap,
            });
            return Card(stack);
        }

        stack.Children.Add(SectionTitle(
            $"{label} · {totalRows} row(s)" + (totalRows > table.Rows.Count ? $" · first {table.Rows.Count}" : "")));

        if (note != null)
        {
            stack.Children.Add(new TextBlock
            {
                Text = note,
                Foreground = new SolidColorBrush(MediaColor.FromRgb(0x92, 0x40, 0x0E)),
                FontSize = 11.5,
                Margin = new Thickness(0, 0, 0, 6),
                TextWrapping = TextWrapping.Wrap,
            });
        }

        var grid = new DataGrid
        {
            AutoGenerateColumns = true,
            IsReadOnly = true,
            CanUserAddRows = false,
            CanUserDeleteRows = false,
            HeadersVisibility = DataGridHeadersVisibility.Column,
            GridLinesVisibility = DataGridGridLinesVisibility.Horizontal,
            HorizontalGridLinesBrush = new SolidColorBrush(MediaColor.FromRgb(0xEE, 0xF2, 0xF7)),
            Background = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            RowHeight = 24,
            MaxHeight = 320,
            FontSize = 12,

            // ⚠ Read-only display, not a control: without these the grid takes focus and paints its
            // first row as "selected", which reads as though the user had clicked something.
            Focusable = false,
            IsSynchronizedWithCurrentItem = false,
            SelectionMode = DataGridSelectionMode.Single,
            RowBackground = Brushes.White,

            // ⚠ Virtualization OFF: these tables are capped at a few hundred rows, and a virtualized
            // grid renders EMPTY when the visual tree is laid out offscreen (the PNG harness) —
            // which would make the picture disagree with the data for no real reason.
            EnableRowVirtualization = false,
            EnableColumnVirtualization = false,
        };

        // ⚠⚠ A DataGrid column header is a ContentPresenter with RecognizesAccessKey=True, so an
        // underscore in a column name is eaten as an access-key marker: the script's `Price_m2`
        // displayed as "Pricem2" and `Total_Price` as "TotalPrice". Handing the header a TextBlock
        // keeps the name verbatim — which matters when the name is a quantity-surveying label.
        grid.AutoGeneratingColumn += (_, e) => e.Column.Header = new TextBlock { Text = e.PropertyName };

        // Set AFTER the handler is attached — columns are generated by this assignment.
        grid.ItemsSource = table.DefaultView;

        stack.Children.Add(grid);
        return Card(stack);
    }

    private static Border Card(UIElement content) => new()
    {
        Background = Brushes.White,
        BorderBrush = new SolidColorBrush(MediaColor.FromRgb(0xE2, 0xE8, 0xF0)),
        BorderThickness = new Thickness(1),
        CornerRadius = new CornerRadius(8),
        Padding = new Thickness(14, 12, 14, 12),
        Margin = new Thickness(0, 0, 0, 12),
        Child = content,
    };

    private static TextBlock SectionTitle(string text) => new()
    {
        Text = text,
        FontSize = 11,
        FontWeight = FontWeights.SemiBold,
        Foreground = new SolidColorBrush(MediaColor.FromRgb(0x64, 0x74, 0x8B)),
        Margin = new Thickness(0, 0, 0, 8),
    };

    // ------------------------------------------------------------------ helpers

    /// <summary>
    /// Drops the characters WPF cannot draw.
    ///
    /// ⚠ The engine's own messages are full of emoji (🏁 🎯 🛑 🔒), because the desktop app renders
    /// them in a browser. WPF has no colour-font support, so anything in the astral plane comes out
    /// as a tofu box — a results window full of empty rectangles reads as "the tool crashed".
    /// BMP symbols (⚠ ✕ ✓) survive and are kept.
    ///
    /// The character AND the space after it are removed, so "🏁 Tiling room" becomes "Tiling room"
    /// rather than " Tiling room" — while deliberate indentation ("   boundary: …") is untouched.
    /// </summary>
    private static string SanitizeLog(string text)
    {
        var output = new StringBuilder(text.Length);
        bool dropNextSpace = false;

        foreach (char c in text)
        {
            if (char.IsSurrogate(c) || c == '\uFE0F')
            {
                dropNextSpace = true;
                continue;
            }

            if (dropNextSpace && c == ' ')
            {
                dropNextSpace = false;
                continue;
            }

            dropNextSpace = false;
            output.Append(c);
        }

        return output.ToString();
    }

    private static string DescribeType(string type) => type switch
    {
        "table" => "Table",
        "chart-bar" => "Bar chart (as data)",
        "chart-pie" => "Pie chart (as data)",
        "chart-line" => "Line chart (as data)",
        "dry_run" => "Dry-run report",
        _ => type,
    };

    /// <summary>
    /// Reads a structured-output payload into rows. The engine serialises whatever the script passed
    /// to <c>Table()</c>: usually an array of objects, sometimes an array of scalars, sometimes a
    /// single object.
    /// </summary>
    private static DataTable? TryBuildTable(string json, out int totalRows, out string? note)
    {
        totalRows = 0;
        note = null;

        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(json);
        }
        catch (JsonException ex)
        {
            note = "Unreadable payload: " + ex.Message;
            return null;
        }

        using (doc)
        {
            JsonElement root = doc.RootElement;

            List<JsonElement> rows;
            if (root.ValueKind == JsonValueKind.Array)
            {
                rows = root.EnumerateArray().ToList();
            }
            else if (root.ValueKind == JsonValueKind.Object)
            {
                rows = [root];
            }
            else
            {
                note = "Payload is a bare value, not rows.";
                return null;
            }

            totalRows = rows.Count;
            if (rows.Count == 0)
            {
                note = "The script emitted an empty result set.";
                return null;
            }

            // Column order = first appearance, so the table reads like the script wrote it.
            var columns = new List<string>();
            bool anyObject = rows.Any(r => r.ValueKind == JsonValueKind.Object);

            if (anyObject)
            {
                foreach (JsonElement row in rows.Where(r => r.ValueKind == JsonValueKind.Object))
                {
                    foreach (JsonProperty property in row.EnumerateObject())
                    {
                        if (!columns.Contains(property.Name))
                        {
                            columns.Add(property.Name);
                        }
                    }
                }
            }
            else
            {
                columns.Add("Value");
            }

            var table = new DataTable();
            foreach (string column in columns)
            {
                table.Columns.Add(column, typeof(string));
            }

            foreach (JsonElement row in rows.Take(MaxRowsShown))
            {
                DataRow dataRow = table.NewRow();
                foreach (string column in columns)
                {
                    dataRow[column] = anyObject ? Cell(row, column) : Scalar(row);
                }

                table.Rows.Add(dataRow);
            }

            return table;
        }
    }

    private static string Cell(JsonElement row, string column)
    {
        if (row.ValueKind != JsonValueKind.Object || !row.TryGetProperty(column, out JsonElement value))
        {
            return "";
        }

        return Scalar(value);
    }

    private static string Scalar(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.String => value.GetString() ?? "",
        JsonValueKind.Null or JsonValueKind.Undefined => "",
        JsonValueKind.Object or JsonValueKind.Array => value.GetRawText(),
        _ => value.ToString(),
    };

    /// <summary>
    /// <c>PipelineDiagnostics</c> is a wire contract with the desktop: positive = item count,
    /// 0 = empty, -1 = chart, -2 = table, -3 = write ok, -4 = write failed.
    /// </summary>
    private static string FormatDiagnostic(int value) => value switch
    {
        -1 => "chart",
        -2 => "table",
        -3 => "✓",
        -4 => "✗",
        _ => value.ToString(CultureInfo.InvariantCulture),
    };

    private void CopyLog()
    {
        var text = new StringBuilder();
        text.AppendLine(_result.IsSuccess ? "SUCCEEDED" : "FAILED");
        if (!_result.IsSuccess)
        {
            text.AppendLine(_result.ErrorMessage);
        }

        text.AppendLine();
        text.Append(_logText);

        try
        {
            Clipboard.SetText(text.ToString());
        }
        catch (Exception ex)
        {
            // The clipboard can be locked by another process; losing a copy must not close the window.
            MessageBox.Show(this, "Could not copy: " + ex.Message, "Results");
        }
    }
}
