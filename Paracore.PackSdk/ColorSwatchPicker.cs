using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using MediaColor = System.Windows.Media.Color;

namespace Paracore.PackSdk;

/// <summary>
/// The colour panel behind the swatch: a saturation/value square you DRAG, a hue strip you DRAG,
/// and a grid of fixed swatches for the colours people reach for most.
///
/// ⚠ WHY DRAGGING MATTERS. A fixed palette can only offer the colours somebody else thought of. A
/// tool whose brand colour is #1B6E4A has to be able to reach it — and once you can drag, the
/// palette stops being a constraint and becomes a shortcut.
///
/// ⚠ WHY IT IS DRAWN HERE. WPF has no colour picker. The desktop's <c>ColorInput.tsx</c> is an
/// <c>&lt;input type="color"&gt;</c>, which the BROWSER draws; there is no WPF equivalent, and
/// <c>System.Windows.Forms.ColorDialog</c> would pull WinForms into a Revit add-in for one control.
///
/// The square is the standard HSV layout, and the gradients are what make it cheap:
///   • a solid rectangle at the chosen HUE,
///   • a white wash left→right (saturation: 0 at the left edge, none at the right),
///   • a black wash top→bottom (value: full at the top, none at the bottom).
/// So x = saturation and y = 1 − value, with no per-pixel work at all.
/// </summary>
internal sealed class ColorSwatchPicker
{
    private const double PlaneWidth = 320;
    private const double PlaneHeight = 120;
    private const double HueBarHeight = 14;
    private const double HueStripHeight = 20; // bar + 3px above and below for the thumb
    private const double PlaneThumbSize = 12;
    private const double HueThumbWidth = 5;
    private const double SwatchPitch = 20;

    private static readonly Brush Edge = new SolidColorBrush(MediaColor.FromRgb(0xC8, 0xD2, 0xDF));

    private readonly Action<string> _changed;
    private readonly Action? _dismiss;

    private readonly Canvas _plane = new() { Width = PlaneWidth, Height = PlaneHeight, Tag = "sv-plane", Cursor = Cursors.Cross };
    private readonly Rectangle _planeBase = new() { Width = PlaneWidth, Height = PlaneHeight };
    private readonly Border _planeThumb = new()
    {
        Width = PlaneThumbSize,
        Height = PlaneThumbSize,
        CornerRadius = new CornerRadius(PlaneThumbSize / 2),
        BorderThickness = new Thickness(2),
        BorderBrush = Brushes.White,
        IsHitTestVisible = false,
        Tag = "sv-thumb",
    };

    private readonly Canvas _hueStrip = new() { Width = PlaneWidth, Height = HueStripHeight, Tag = "hue-strip", Cursor = Cursors.Hand };
    private readonly Rectangle _hueBase = new() { Width = PlaneWidth, Height = HueBarHeight };
    private readonly Border _hueThumb = new()
    {
        Width = HueThumbWidth,
        Height = HueStripHeight,
        BorderThickness = new Thickness(1.5),
        BorderBrush = Brushes.White,
        IsHitTestVisible = false,
        Tag = "hue-thumb",
    };

    private double _hue;
    private double _saturation = 1;
    private double _value = 1;

    /// <summary>The panel to put in a popup. Everything else here is internal to it.</summary>
    public FrameworkElement Root { get; }

    public ColorSwatchPicker(string? initialHex, Action<string> changed, Action? dismiss = null)
    {
        _changed = changed;
        _dismiss = dismiss;

        // ---- saturation / value square -----------------------------------------------
        _planeBase.Fill = new SolidColorBrush(FromHsv(_hue, 1, 1));
        _plane.Children.Add(_planeBase);

        // ⚠ Both washes are IsHitTestVisible=false, so every drag reaches the Canvas underneath
        // and there is ONE mapping from a point to a colour, whatever is drawn on top.
        _plane.Children.Add(new Rectangle
        {
            Width = PlaneWidth,
            Height = PlaneHeight,
            Fill = new LinearGradientBrush(
                MediaColor.FromArgb(255, 255, 255, 255),
                MediaColor.FromArgb(0, 255, 255, 255),
                new Point(0, 0.5),
                new Point(1, 0.5)),
            IsHitTestVisible = false,
        });

        _plane.Children.Add(new Rectangle
        {
            Width = PlaneWidth,
            Height = PlaneHeight,
            Fill = new LinearGradientBrush(
                MediaColor.FromArgb(0, 0, 0, 0),
                MediaColor.FromArgb(255, 0, 0, 0),
                new Point(0.5, 0),
                new Point(0.5, 1)),
            IsHitTestVisible = false,
        });

        _plane.Children.Add(_planeThumb);

        _plane.MouseLeftButtonDown += (_, e) => { _plane.CaptureMouse(); PickPlane(e.GetPosition(_plane)); };
        _plane.MouseMove += (_, e) => { if (_plane.IsMouseCaptured) PickPlane(e.GetPosition(_plane)); };
        _plane.MouseLeftButtonUp += (_, _) => _plane.ReleaseMouseCapture();

        // ---- hue strip ---------------------------------------------------------------
        Canvas.SetTop(_hueBase, (HueStripHeight - HueBarHeight) / 2);
        _hueBase.Fill = HueWheel();
        _hueStrip.Children.Add(_hueBase);
        _hueStrip.Children.Add(_hueThumb);

        _hueStrip.MouseLeftButtonDown += (_, e) => { _hueStrip.CaptureMouse(); PickHueStrip(e.GetPosition(_hueStrip)); };
        _hueStrip.MouseMove += (_, e) => { if (_hueStrip.IsMouseCaptured) PickHueStrip(e.GetPosition(_hueStrip)); };
        _hueStrip.MouseLeftButtonUp += (_, _) => _hueStrip.ReleaseMouseCapture();

        // ---- the panel ---------------------------------------------------------------
        var root = new StackPanel();
        root.Children.Add(new Border
        {
            BorderBrush = Edge,
            BorderThickness = new Thickness(1),
            Child = _plane,
            Margin = new Thickness(0, 0, 0, 3),
        });
        root.Children.Add(new Border
        {
            BorderBrush = Edge,
            BorderThickness = new Thickness(1),
            Child = _hueStrip,
            Margin = new Thickness(0, 0, 0, 6),
        });
        root.Children.Add(BuildSwatches());

        Root = root;

        Sync(initialHex);
    }

    // ------------------------------------------------------------------ picking

    /// <summary>
    /// Chooses a point on the square. Saturation and value are 0–1; the square is
    /// x = saturation, y = 1 − value.
    /// </summary>
    public void PickSaturationValue(double saturation, double value)
    {
        _saturation = Math.Clamp(saturation, 0, 1);
        _value = Math.Clamp(value, 0, 1);
        MoveThumbs();
        Emit();
    }

    /// <summary>Chooses the hue, 0–360 degrees.</summary>
    public void PickHue(double degrees)
    {
        _hue = Math.Clamp(degrees, 0, 360);
        _planeBase.Fill = new SolidColorBrush(FromHsv(_hue, 1, 1));
        MoveThumbs();
        Emit();
    }

    private void PickPlane(Point point) => PickSaturationValue(
        Math.Clamp(point.X / PlaneWidth, 0, 1),
        1 - Math.Clamp(point.Y / PlaneHeight, 0, 1));

    private void PickHueStrip(Point point) => PickHue(Math.Clamp(point.X / PlaneWidth, 0, 1) * 360);

    private void Emit()
    {
        MediaColor colour = FromHsv(_hue, _saturation, _value);
        _changed($"#{colour.R:X2}{colour.G:X2}{colour.B:X2}");
    }

    /// <summary>
    /// Follows the hex box. Called on every edit, so typing <c>#1B6E4A</c> moves the thumbs there
    /// instead of leaving the panel disagreeing with the field.
    /// </summary>
    public void Sync(string? hex)
    {
        if (!TryParse(hex, out MediaColor colour))
        {
            return;
        }

        // ⚠ If the CURRENT h/s/v already produces this exact colour, the change came FROM this
        // panel. Re-deriving h/s/v from an 8-bit hex would only drift the thumbs by a pixel while
        // the user is dragging — the round trip is lossy in exactly that way.
        if (FromHsv(_hue, _saturation, _value) == colour)
        {
            return;
        }

        ToHsv(colour, out _hue, out _saturation, out _value);
        _planeBase.Fill = new SolidColorBrush(FromHsv(_hue, 1, 1));
        MoveThumbs();
    }

    private void MoveThumbs()
    {
        // Clamped so a thumb at an edge sits flush inside the square instead of hanging over it.
        Canvas.SetLeft(_planeThumb, Math.Clamp((_saturation * PlaneWidth) - (PlaneThumbSize / 2), 0, PlaneWidth - PlaneThumbSize));
        Canvas.SetTop(_planeThumb, Math.Clamp(((1 - _value) * PlaneHeight) - (PlaneThumbSize / 2), 0, PlaneHeight - PlaneThumbSize));

        Canvas.SetLeft(_hueThumb, Math.Clamp((_hue / 360 * PlaneWidth) - (HueThumbWidth / 2), 0, PlaneWidth - HueThumbWidth));
        Canvas.SetTop(_hueThumb, 0);
    }

    // ------------------------------------------------------------------ fixed swatches

    /// <summary>
    /// 16 greys and 16 hues at six brightnesses. Kept BELOW the square on purpose: it is the fast
    /// path, not the only path, and a row of greys is genuinely quicker to hit than a drag.
    /// </summary>
    private FrameworkElement BuildSwatches()
    {
        var cells = new WrapPanel { Width = 16 * SwatchPitch };

        for (int i = 0; i < 16; i++)
        {
            byte level = (byte)(i * 17); // 0, 17, … 255 — an even ramp from black to white
            cells.Children.Add(SwatchCell(MediaColor.FromRgb(level, level, level)));
        }

        foreach (double value in new[] { 1.0, 0.9, 0.75, 0.6, 0.45, 0.3 })
        {
            for (int i = 0; i < 16; i++)
            {
                cells.Children.Add(SwatchCell(FromHsv(i * 22.5, 1.0, value)));
            }
        }

        return cells;
    }

    private Border SwatchCell(MediaColor colour)
    {
        string hex = $"#{colour.R:X2}{colour.G:X2}{colour.B:X2}";

        var cell = new Border
        {
            Width = 16,
            Height = 16,
            Margin = new Thickness(2),
            Background = new SolidColorBrush(colour),
            BorderBrush = Edge,
            BorderThickness = new Thickness(0.5),
            Cursor = Cursors.Hand,
            ToolTip = hex,
        };

        cell.MouseLeftButtonUp += (_, _) =>
        {
            // Through the same maths the hex box uses, so the square and the strip follow a click.
            if (TryParse(hex, out MediaColor picked))
            {
                ToHsv(picked, out _hue, out _saturation, out _value);
                _planeBase.Fill = new SolidColorBrush(FromHsv(_hue, 1, 1));
                MoveThumbs();
            }

            _changed(hex);

            // ⚠ A fixed swatch is a COMPLETE choice, so the panel closes. A drag is not: the user
            // is still adjusting and must be able to see the field update while they do it.
            _dismiss?.Invoke();
        };

        return cell;
    }

    // ------------------------------------------------------------------ colour maths

    /// <summary>Hue in degrees 0–360, saturation and value 0–1.</summary>
    internal static MediaColor FromHsv(double hue, double saturation, double value)
    {
        double c = value * saturation;
        double h = hue / 60.0;
        double x = c * (1 - Math.Abs((h % 2) - 1));

        (double r, double g, double b) = h switch
        {
            < 1 => (c, x, 0d),
            < 2 => (x, c, 0d),
            < 3 => (0d, c, x),
            < 4 => (0d, x, c),
            < 5 => (x, 0d, c),
            _ => (c, 0d, x),
        };

        double m = value - c;
        return MediaColor.FromRgb(
            (byte)Math.Round((r + m) * 255),
            (byte)Math.Round((g + m) * 255),
            (byte)Math.Round((b + m) * 255));
    }

    private static void ToHsv(MediaColor colour, out double hue, out double saturation, out double value)
    {
        double r = colour.R / 255.0;
        double g = colour.G / 255.0;
        double b = colour.B / 255.0;

        double max = Math.Max(r, Math.Max(g, b));
        double min = Math.Min(r, Math.Min(g, b));
        double delta = max - min;

        value = max;
        saturation = max <= 0 ? 0 : delta / max;

        if (delta <= 0)
        {
            hue = 0; // grey: any hue produces the same colour, so keep it at red
            return;
        }

        hue = max == r ? 60 * (((g - b) / delta) % 6)
            : max == g ? 60 * (((b - r) / delta) + 2)
            : 60 * (((r - g) / delta) + 4);

        if (hue < 0)
        {
            hue += 360;
        }
    }

    private static Brush HueWheel()
    {
        var brush = new LinearGradientBrush { StartPoint = new Point(0, 0.5), EndPoint = new Point(1, 0.5) };

        for (int i = 0; i <= 6; i++)
        {
            // i = 6 wraps back to red, which is what makes the strip continuous at its ends.
            brush.GradientStops.Add(new GradientStop(FromHsv(i * 60 % 360, 1, 1), i / 6.0));
        }

        return brush;
    }

    private static bool TryParse(string? hex, out MediaColor colour)
    {
        colour = default;

        if (string.IsNullOrWhiteSpace(hex))
        {
            return false;
        }

        try
        {
            if (ColorConverter.ConvertFromString(hex) is MediaColor parsed)
            {
                colour = MediaColor.FromRgb(parsed.R, parsed.G, parsed.B);
                return true;
            }
        }
        catch
        {
            // A half-typed hex ("#1B6") is the normal case while the user is editing, not an error.
        }

        return false;
    }
}
