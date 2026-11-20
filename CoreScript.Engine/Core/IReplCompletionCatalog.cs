using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace CoreScript.Engine.Core
{
    /// <summary>
    /// Supplies Revit-domain names to REPL string-literal completion.
    ///
    /// <para>
    /// The engine deliberately owns no live document during completion:
    /// <c>ScriptApi.Doc</c> is backed by an <c>AsyncLocal</c> that exists only while a
    /// script executes, and completion runs on every keystroke outside that context.
    /// The host implements this interface because it owns the Revit document and can
    /// marshal reads onto Revit's UI thread.
    /// </para>
    ///
    /// <para>
    /// Both sets are finite and model-backed. Categories are <c>BuiltInCategory</c>
    /// members with the <c>OST_</c> prefix stripped; parameter names include the
    /// document's shared parameters, so only the host can enumerate them.
    /// </para>
    /// </summary>
    public interface IReplCompletionCatalog
    {
        /// <summary>All category names accepted by <c>GetElements("Category")</c>.</summary>
        Task<IReadOnlyList<ReplCompletion>> GetCategoryCompletionsAsync(
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Parameter names available on instances (and their types) of one category.
        /// The hint may be the display name (<c>"Walls"</c>) or its enum spelling
        /// (<c>"OST_Walls"</c>) — the host normalizes it.
        ///
        /// <para>
        /// This is name-only, unlike <c>CombinedParams()</c>, which also reads and formats
        /// every value and needs a live element on Revit's UI thread. Completion fires on
        /// every keystroke, so the host samples ONE element of the category and returns its
        /// instance + type parameter definitions. Native CLR members (e.g. <c>Room.Area</c>)
        /// are a separate concern: Roslyn completes those after <c>.</c> from the real Revit
        /// references, which is also why <c>Wall.Area</c> is correctly rejected — it is a
        /// Revit parameter, not a CLR property.
        /// </para>
        /// </summary>
        Task<IReadOnlyList<ReplCompletion>> GetParameterCompletionsAsync(
            string categoryHint,
            CancellationToken cancellationToken = default);
    }
}
