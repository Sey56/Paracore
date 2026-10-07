using Autodesk.Revit.DB;
using System.Collections.Generic;

namespace CoreScript.Engine.Globals
{
    /// <summary>
    /// The failure preprocessor a <see cref="StairsEditScope"/> needs at its
    /// <c>Commit(...)</c> call.
    /// <para>
    /// <b>Why this type exists at all.</b> Creating stairs is the one modelling recipe that
    /// must be committed through a preprocessor: <c>StairsEditScope.Commit(null)</c> throws,
    /// and a script that follows the documented stairs snippet would otherwise have to
    /// invent this class itself — which is a compile error (<c>CS0246</c>) waiting for
    /// anyone who writes the snippet as shown. Declaring it in the engine makes the
    /// documented snippet compile as written. It lives here rather than in a prompt so
    /// there is ONE definition, not one per instruction file (a rule in N places must be
    /// changed in N places).
    /// </para>
    /// <para>
    /// ⚠ <b>This is a SHARED (non-Pro) capability</b> — it uses only
    /// <see cref="Autodesk.Revit.DB"/> and is present in the free build and the Pro build
    /// alike. Do not introduce a Pro dependency here.
    /// </para>
    /// <para>
    /// <b>Behaviour</b> (mirrors the Revit SDK's stairs sample):
    /// every warning is deleted, and the first <b>error</b> rolls the whole scope back.
    /// Rolling back is the point of using a preprocessor here — the alternative is a
    /// half-built run left in the document, which is worse than no run at all.
    /// </para>
    /// <example>
    /// <code>
    /// using (var scope = new StairsEditScope(Doc, "Create stairs")) {
    ///     var stairsId = scope.StartTransaction(levelBottom.Id, levelTop.Id);
    ///     // ... create the run / sketched stairs between the two levels here ...
    ///     scope.Commit(new StairsFailurePreprocessor());
    /// }
    /// </code>
    /// </example>
    /// </summary>
    public sealed class StairsFailurePreprocessor : IFailuresPreprocessor
    {
        /// <summary>
        /// Called by Revit while the stairs scope is committing. Warnings are swallowed;
        /// an error aborts the commit and rolls the scope back.
        /// </summary>
        public FailureProcessingResult PreprocessFailures(FailuresAccessor failuresAccessor)
        {
            IList<FailureMessageAccessor> failures = failuresAccessor.GetFailureMessages();

            foreach (FailureMessageAccessor failure in failures)
            {
                if (failure.GetSeverity() == FailureSeverity.Warning)
                {
                    // A warning does not make the run invalid — drop it and carry on.
                    failuresAccessor.DeleteWarning(failure);
                }
                else
                {
                    // An error means the run cannot be produced as asked. Roll the whole
                    // scope back rather than leaving a partially-built stair behind.
                    return FailureProcessingResult.ProceedWithRollBack;
                }
            }

            return FailureProcessingResult.ProceedWithCommit;
        }
    }
}
