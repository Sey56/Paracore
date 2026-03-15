using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;

namespace CoreScript.Engine.Core.Parsers
{
    public static class ExtractionUtils
    {
        private static readonly Assembly RevitAssembly = typeof(Autodesk.Revit.DB.Element).Assembly;
        private static readonly string[] RevitNamespaces = {
            "Autodesk.Revit.DB",
            "Autodesk.Revit.DB.Architecture",
            "Autodesk.Revit.DB.Structure",
            "Autodesk.Revit.DB.Mechanical",
            "Autodesk.Revit.DB.Plumbing",
            "Autodesk.Revit.DB.Electrical"
        };

        public static string ExtractString(ExpressionSyntax expr)
        {
            if (expr == null)
            {
                return "";
            }

            if (expr is LiteralExpressionSyntax l)
            {
                return l.Token.ValueText;
            }

            if (expr is InvocationExpressionSyntax inv && inv.Expression.ToString() == "nameof" && inv.ArgumentList.Arguments.Count > 0)
            {
                return inv.ArgumentList.Arguments[0].Expression.ToString();
            }
            if (expr is IdentifierNameSyntax id)
            {
                return id.Identifier.Text;
            }

            return expr is MemberAccessExpressionSyntax mem ? mem.Name.Identifier.Text : expr.ToString().Trim('"', '\'');
        }

        public static double? ExtractDouble(ExpressionSyntax expr)
        {
            if (expr is LiteralExpressionSyntax l && l.Token.Value != null)
            {
                try { return Convert.ToDouble(l.Token.Value); } catch { }
            }
            if (expr is PrefixUnaryExpressionSyntax pre && pre.OperatorToken.IsKind(SyntaxKind.MinusToken) && pre.Operand is LiteralExpressionSyntax op)
            {
                if (op.Token.Value != null)
                {
                    try { return -Convert.ToDouble(op.Token.Value); } catch { }
                }
            }
            return null;
        }

        public static bool ExtractBool(ExpressionSyntax expr)
        {
            if (expr is LiteralExpressionSyntax l && l.Token.Value is bool b)
            {
                return b;
            }

            string txt = expr.ToString().ToLower();
            return txt == "true" || txt == "1";
        }

        public static bool IsRevitElementType(string typeName)
        {
            var type = ResolveRevitType(typeName);
            return type != null && typeof(Autodesk.Revit.DB.Element).IsAssignableFrom(type);
        }

        public static bool IsRevitEnumType(string typeName)
        {
            var type = ResolveRevitType(typeName);
            return type != null && type.IsEnum;
        }

        private static Type ResolveRevitType(string typeName)
        {
            if (string.IsNullOrEmpty(typeName))
            {
                return null;
            }

            foreach (var ns in RevitNamespaces)
            {
                var type = RevitAssembly.GetType($"{ns}.{typeName}");
                if (type != null)
                {
                    return type;
                }
            }
            return null;
        }

        public static bool IsManagedAssembly(string path)
        {
            try { AssemblyName.GetAssemblyName(path); return true; }
            catch { return false; }
        }

        public static (double? Min, double? Max, double? Step) ExtractRange(ExpressionSyntax expr)
        {
            if (expr is TupleExpressionSyntax tuple)
            {
                double? min = tuple.Arguments.Count >= 1 ? ExtractDouble(tuple.Arguments[0].Expression) : null;
                double? max = tuple.Arguments.Count >= 2 ? ExtractDouble(tuple.Arguments[1].Expression) : null;
                double? step = tuple.Arguments.Count >= 3 ? ExtractDouble(tuple.Arguments[2].Expression) : null;
                return (min, max, step);
            }
            if (expr is CollectionExpressionSyntax col)
            {
                var vals = col.Elements.OfType<ExpressionElementSyntax>().Select(e => ExtractDouble(e.Expression)).ToList();
                return (vals.Count >= 1 ? vals[0] : null, vals.Count >= 2 ? vals[1] : null, vals.Count >= 3 ? vals[2] : null);
            }
            if (expr is ImplicitArrayCreationExpressionSyntax imp && imp.Initializer != null)
            {
                var vals = imp.Initializer.Expressions.Select(ExtractString).Select(s => double.TryParse(s, out var d) ? (double?)d : null).ToList();
                return (vals.Count >= 1 ? vals[0] : null, vals.Count >= 2 ? vals[1] : null, vals.Count >= 3 ? vals[2] : null);
            }
            return (null, null, null);
        }

        public static string ParseVisibilityExpression(ExpressionSyntax expr)
        {
            if (expr is BinaryExpressionSyntax binary)
            {
                string left = binary.Left.ToString();
                string right = binary.Right.ToString().Trim('"', '\'');
                string op = binary.OperatorToken.ValueText;
                if (op == "==" || op == "!=")
                {
                    return $"{left} {op} '{right}'";
                }
            }
            else if (expr is IdentifierNameSyntax id)
            {
                return $"{id.Identifier.Text} == 'true'";
            }
            else if (expr is PrefixUnaryExpressionSyntax pre && pre.OperatorToken.IsKind(SyntaxKind.ExclamationToken))
            {
                return $"{pre.Operand.ToString()} != 'true'";
            }

            return expr.ToString();
        }

        public static List<string> ExtractStringsFromInitializer(ExpressionSyntax expr)
        {
            if (expr == null)
            {
                return new List<string>();
            }

            if (expr is LiteralExpressionSyntax lit && lit.Token.Value is string val)
            {
                return val.Contains(",")
                    ? val.Split(',').Select(o => o.Trim()).Where(o => !string.IsNullOrEmpty(o)).ToList()
                    : new List<string> { val };
            }
            if (expr is CollectionExpressionSyntax col)
            {
                return col.Elements.OfType<ExpressionElementSyntax>().Select(e => ExtractString(e.Expression)).Where(v => !string.IsNullOrEmpty(v)).ToList();
            }
            return expr is ImplicitArrayCreationExpressionSyntax imp && imp.Initializer != null
                ? imp.Initializer.Expressions.Select(ExtractString).Where(v => !string.IsNullOrEmpty(v)).ToList()
                : new List<string>();
        }

        public static bool IsSimpleStaticExpression(ExpressionSyntax expr)
        {
            if (expr == null)
            {
                return true;
            }

            if (expr is LiteralExpressionSyntax)
            {
                return true;
            }

            if (expr is TupleExpressionSyntax tuple)
            {
                return tuple.Arguments.All(a => IsSimpleStaticExpression(a.Expression));
            }

            if (expr is CollectionExpressionSyntax col)
            {
                return col.Elements.OfType<ExpressionElementSyntax>().All(e => IsSimpleStaticExpression(e.Expression));
            }

            if (expr is ImplicitArrayCreationExpressionSyntax imp && imp.Initializer != null)
            {
                return imp.Initializer.Expressions.All(IsSimpleStaticExpression);
            }

            if (expr is ArrayCreationExpressionSyntax arr)
            {
                return arr.Initializer == null || arr.Initializer.Expressions.All(IsSimpleStaticExpression);
            }

            return expr is InvocationExpressionSyntax inv && inv.Expression.ToString() == "nameof";
        }
    }
}
