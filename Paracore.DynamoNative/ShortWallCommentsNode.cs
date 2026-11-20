using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Windows.Forms;
using Autodesk.Revit.DB;

namespace Paracore.DynamoNative
{
    /// <summary>
    /// Standalone Dynamo nodes for Revit. This assembly references only RevitAPI and the
    /// .NET framework; it has no dependency on the Paracore add-in, engine, shim or MCP.
    /// </summary>
    public static class ShortWallCommentsNode
    {
        /// <summary>
        /// Lists walls shorter than a threshold and optionally writes a comment to them.
        /// A dry run executes the same write and rolls it back. A real write requires the
        /// person to type APPLY in the Revit dialog; the node has no Confirm input.
        /// </summary>
        /// <param name="document">Dynamo's Document.Current output, or a raw Revit Document.</param>
        /// <param name="maxLengthMm">Wall length threshold in millimetres, exclusive (Dynamo Number).</param>
        /// <param name="commentText">Text written to Comments when applyComments is true.</param>
        /// <param name="applyComments">false = read only; true = write Comments.</param>
        /// <param name="dryRun">true = preview and roll back; false = commit the write.</param>
        /// <returns>One row per short wall: id, name, length and the Comments value after the write.</returns>
        public static IList<string> ShortWallComments(
            object document,
            double maxLengthMm,
            string commentText,
            bool applyComments,
            bool dryRun)
        {
            Document revitDocument = ResolveDocument(document);

            string text = commentText ?? string.Empty;
            var walls = new FilteredElementCollector(revitDocument)
                .OfClass(typeof(Wall))
                .Cast<Wall>()
                .Where(w => LengthMm(w) < maxLengthMm)
                .ToList();

            // Captured INSIDE the transaction: after a dry-run rollback the live element
            // reverts, so reading it later would wrongly report the pre-write value.
            var commentsAfterWrite = new Dictionary<long, string>();

            if (applyComments && walls.Count > 0)
            {
                if (!dryRun && !AskApproval("Short wall comments", "APPLY"))
                {
                    // ⚠ Do NOT throw here. A thrown exception pins the node in Dynamo's
                    // error state and it will not re-execute on the next Run until an
                    // input changes — which is why retrying after Cancel appeared broken.
                    // A normal result with an explicit marker is just as honest and keeps
                    // the node immediately re-runnable. No transaction has started yet.
                    return DeclinedRows(walls);
                }

                using (var group = new TransactionGroup(revitDocument, "Short wall comments"))
                {
                    group.Start();
                    using (var transaction = new Transaction(revitDocument, "Set Comments"))
                    {
                        transaction.Start();
                        foreach (Wall wall in walls)
                        {
                            Parameter parameter = wall.get_Parameter(BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS);
                            if (parameter != null && !parameter.IsReadOnly)
                                parameter.Set(text);
                            commentsAfterWrite[wall.Id.Value] = Comments(wall);
                        }
                        transaction.Commit();
                    }

                    if (dryRun) group.RollBack();
                    else group.Commit();
                }
            }

            // Dry-run values are what WOULD be committed — label them so nobody mistakes
            // a preview for a committed write.
            string suffix = applyComments ? (dryRun ? " (dry run)" : string.Empty) : string.Empty;

            return walls.Select(w =>
            {
                string comments = commentsAfterWrite.TryGetValue(w.Id.Value, out string value)
                    ? value
                    : Comments(w);
                return w.Id.Value + " | " + w.Name + " | " +
                       LengthMm(w).ToString("0.0", System.Globalization.CultureInfo.InvariantCulture) +
                       " mm | Comments=" + comments + suffix;
            }).ToList();
        }

        /// <summary>
        /// Refusal report: same row shape as a normal run, but explicitly marked so nobody
        /// can mistake it for a write. Returned, never thrown — see the note in the caller.
        /// </summary>
        private static List<string> DeclinedRows(IEnumerable<Wall> walls)
        {
            const string marker = " | CONFIRMATION DECLINED — nothing was executed";
            return walls.Select(w =>
                w.Id.Value + " | " + w.Name + " | " +
                LengthMm(w).ToString("0.0", System.Globalization.CultureInfo.InvariantCulture) +
                " mm | Comments=" + (Comments(w) ?? string.Empty) + marker).ToList();
        }

        /// <summary>
        /// Accepts either a raw <see cref="Document"/> or Dynamo's
        /// <c>Revit.Application.Document</c> wrapper. No Dynamo assembly is referenced:
        /// the wrapper is unwrapped by reflection so this DLL stays a plain ZeroTouch
        /// library that works across Dynamo versions.
        /// </summary>
        private static Document ResolveDocument(object source)
        {
            if (source == null)
                throw new ArgumentNullException(nameof(source), "Connect Dynamo's Document node to this input.");

            Document direct = source as Document;
            if (direct != null) return direct;

            // ⚠ Revit.Application.Document.InternalDocument is NONPUBLIC in Dynamo 3.3 —
            // Public-only reflection misses it and the node throws on the wrapper.
            const BindingFlags flags = BindingFlags.Public | BindingFlags.NonPublic |
                                       BindingFlags.Instance | BindingFlags.FlattenHierarchy;
            Type type = source.GetType();

            PropertyInfo named = type.GetProperty("InternalDocument", flags);
            if (named != null && named.CanRead && typeof(Document).IsAssignableFrom(named.PropertyType))
                return (Document)named.GetValue(source, null);

            foreach (PropertyInfo property in type.GetProperties(flags))
                if (property.CanRead && typeof(Document).IsAssignableFrom(property.PropertyType))
                    return (Document)property.GetValue(source, null);

            foreach (FieldInfo field in type.GetFields(flags))
                if (typeof(Document).IsAssignableFrom(field.FieldType))
                    return (Document)field.GetValue(source);

            foreach (MethodInfo method in type.GetMethods(flags))
                if (method.ReturnType == typeof(Document) && method.GetParameters().Length == 0)
                    return (Document)method.Invoke(source, null);

            throw new ArgumentException(
                "Expected a Revit Document or Dynamo's Revit.Application.Document, got " +
                type.FullName + ".", nameof(source));
        }

        private static double LengthMm(Wall wall)
        {
            Parameter parameter = wall.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH);
            if (parameter == null) return 0.0;
            return UnitUtils.ConvertFromInternalUnits(parameter.AsDouble(), UnitTypeId.Millimeters);
        }

        private static string Comments(Wall wall)
        {
            Parameter parameter = wall.get_Parameter(BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS);
            return parameter == null ? string.Empty : parameter.AsString();
        }

        /// <summary>
        /// Manual-execution gate. Shown only for a real write, never for a dry run or a read.
        /// </summary>
        private static bool AskApproval(string toolName, string expectedWord)
        {
            using (var form = new System.Windows.Forms.Form())
            {
                form.Text = toolName + " confirmation";
                form.Width = 420;
                form.Height = 170;
                form.StartPosition = FormStartPosition.CenterScreen;
                form.TopMost = true;
                form.FormBorderStyle = FormBorderStyle.FixedDialog;
                form.MinimizeBox = false;
                form.MaximizeBox = false;

                var label = new Label
                {
                    Left = 14,
                    Top = 14,
                    Width = 380,
                    Text = "Type " + expectedWord + " to allow this write, then click OK."
                };
                var input = new TextBox { Left = 14, Top = 40, Width = 380 };
                var ok = new Button { Text = "OK", Left = 236, Top = 76, Width = 76, DialogResult = DialogResult.OK };
                var cancel = new Button { Text = "Cancel", Left = 318, Top = 76, Width = 76, DialogResult = DialogResult.Cancel };

                form.Controls.Add(label);
                form.Controls.Add(input);
                form.Controls.Add(ok);
                form.Controls.Add(cancel);
                form.AcceptButton = ok;
                form.CancelButton = cancel;

                return form.ShowDialog() == DialogResult.OK &&
                       string.Equals(input.Text, expectedWord, StringComparison.Ordinal);
            }
        }
    }
}
