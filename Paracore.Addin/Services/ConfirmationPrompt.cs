using System;
using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;

// Revit/WPF collisions — same aliases the existing dialogs use.
using WpfBrush = System.Windows.Media.SolidColorBrush;
using WpfButton = System.Windows.Controls.Button;
using WpfColor = System.Windows.Media.Color;
using WpfTextBox = System.Windows.Controls.TextBox;

namespace Paracore.Addin.Services
{
    /// <summary>
    /// The human confirmation prompt for an AGENT-driven run of a <c>[Confirm("WORD")]</c> tool.
    ///
    /// ⚠⚠ WHY THIS IS IN REVIT AND NOT IN THE AGENT'S UI. An MCP server cannot show UI, and the
    /// engine cannot tell WHO supplied a value — so a gate satisfied by "a value arrived" is
    /// satisfiable by the agent itself (it can read the word straight out of the script source).
    /// The only unforgeable answer is one a person gives in front of Revit.
    ///
    /// ⚠⚠ WHY <c>Topmost</c>. The user works in Claude Desktop / WorkBuddy, and Revit is usually
    /// behind those windows — a normal modal dialog can therefore be missed entirely, and an
    /// unanswered prompt is worse than no prompt. <c>Topmost</c> + taskbar + focus makes it
    /// impossible to overlook.
    ///
    /// Must be called from the Revit UI thread (same rule as <c>SessionGate</c>).
    /// </summary>
    public static class ConfirmationPrompt
    {
        /// <summary>
        /// Asks the person to type <paramref name="word"/>. Returns true only on an exact match.
        /// Anything else — Cancel, the X button, Escape, a wrong word — returns false.
        /// </summary>
        public static bool Ask(string toolName, string parameterName, string word)
        {
            var win = new ConfirmationWindow(toolName, parameterName, word);
            try
            {
                new WindowInteropHelper(win).Owner = Process.GetCurrentProcess().MainWindowHandle;
            }
            catch
            {
                // No owner is survivable — the window is Topmost regardless.
            }
            return win.ShowDialog() == true;
        }
    }

    /// <summary>
    /// Built in code, with no XAML: a confirmation window is not worth a Page item and a
    /// namespace mapping, and a code-only window cannot fail on a XAML typo.
    /// </summary>
    public class ConfirmationWindow : Window
    {
        private static readonly WpfBrush HeaderBrush = new(WpfColor.FromRgb(31, 78, 120));
        private static readonly WpfBrush BodyBrush = new(WpfColor.FromRgb(60, 60, 80));
        private static readonly WpfBrush MutedBrush = new(WpfColor.FromRgb(110, 110, 130));

        private readonly string _word;
        private readonly WpfTextBox _input;
        private readonly WpfButton _ok;

        public ConfirmationWindow(string toolName, string parameterName, string word)
        {
            _word = word ?? string.Empty;

            Title = "Paracore — Confirmation Required";
            Width = 560;
            SizeToContent = SizeToContent.Height;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            ResizeMode = ResizeMode.NoResize;
            ShowInTaskbar = true;
            // ⚠ The whole point: this must not hide behind the agent's window.
            Topmost = true;
            Background = new WpfBrush(WpfColor.FromRgb(245, 245, 250));

            var panel = new StackPanel { Margin = new Thickness(20) };

            panel.Children.Add(new TextBlock
            {
                Text = "An AI agent wants to run a tool that requires your confirmation.",
                FontWeight = FontWeights.Bold,
                FontSize = 14,
                TextWrapping = TextWrapping.Wrap,
                Foreground = HeaderBrush,
                Margin = new Thickness(0, 0, 0, 12)
            });

            panel.Children.Add(new TextBlock
            {
                Text = $"Tool:  {(string.IsNullOrWhiteSpace(toolName) ? "(unknown)" : toolName)}",
                FontSize = 13,
                Foreground = BodyBrush,
                TextWrapping = TextWrapping.Wrap
            });

            panel.Children.Add(new TextBlock
            {
                Text = $"Parameter:  {parameterName}",
                FontSize = 12,
                Foreground = MutedBrush,
                Margin = new Thickness(0, 2, 0, 10)
            });

            panel.Children.Add(new TextBlock
            {
                Text = $"This tool changes the model in a way its author marked destructive. " +
                       $"The agent cannot confirm this for you — type  {_word}  to allow the run:",
                FontSize = 13,
                Foreground = BodyBrush,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 0, 0, 8)
            });

            _input = new WpfTextBox
            {
                FontSize = 16,
                Padding = new Thickness(6),
                Margin = new Thickness(0, 0, 0, 14)
            };

            // ⚠ _ok is created BEFORE the TextChanged wiring below. The lambda captures the
            // field, so wiring first made the compiler flag a dereference of a field that was
            // still unassigned at that point (CS8602).
            _ok = new WpfButton
            {
                Content = string.IsNullOrEmpty(_word) ? "Continue" : _word,
                MinWidth = 120,
                Padding = new Thickness(12, 6, 12, 6),
                IsEnabled = string.IsNullOrEmpty(_word)
            };
            _ok.Click += (_, __) => { DialogResult = true; };

            _input.TextChanged += (_, __) => _ok.IsEnabled = Matches();
            panel.Children.Add(_input);

            var row = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Right
            };

            var cancel = new WpfButton
            {
                Content = "Cancel",
                MinWidth = 120,
                Padding = new Thickness(12, 6, 12, 6),
                Margin = new Thickness(10, 0, 0, 0),
                IsCancel = true
            };
            cancel.Click += (_, __) => { DialogResult = false; };

            row.Children.Add(_ok);
            row.Children.Add(cancel);
            panel.Children.Add(row);

            Content = panel;

            Loaded += (_, __) =>
            {
                Activate();
                _input.Focus();
            };
        }

        /// <summary>Ordinal — the engine's pattern is <c>^WORD$</c>, which is case-sensitive.</summary>
        private bool Matches()
            => string.IsNullOrEmpty(_word) || string.Equals(_input.Text?.Trim(), _word, StringComparison.Ordinal);
    }
}
