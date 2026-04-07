using Autodesk.Revit.DB;
using System.Collections.Generic;

namespace SH_Tools.Handlers
{
    public class WarningHandler : IFailuresPreprocessor
    {
        private Document _document;
        private List<ElementId> _openingsToDelete;
        private HashSet<string> _warningGuids;

        public WarningHandler(Document document)
        {
            _document = document;
            _openingsToDelete = new List<ElementId>();
            _warningGuids = new HashSet<string>();
        }

        public FailureProcessingResult PreprocessFailures(FailuresAccessor failuresAccessor)
        {
            IList<FailureMessageAccessor> failureMessages = failuresAccessor.GetFailureMessages();
            foreach (FailureMessageAccessor failureMessage in failureMessages)
            {
                FailureDefinitionId failureId = failureMessage.GetFailureDefinitionId();
                _warningGuids.Add(failureId.Guid.ToString());
                if (failureId.Guid.ToString().Contains("Rectangular opening doesn't cut its host"))
                {
                    // Collect the openings that need to be deleted
                    foreach (ElementId elementId in failureMessage.GetFailingElementIds())
                    {
                        _openingsToDelete.Add(elementId);
                    }
                    failuresAccessor.DeleteWarning(failureMessage);
                }
            }
            return FailureProcessingResult.Continue;
        }

        public void DeleteInvalidOpenings()
        {
            using Transaction trans = new(_document, "Delete Invalid Openings");
            trans.Start();
            foreach (ElementId openingId in _openingsToDelete)
            {
                _document.Delete(openingId);
            }
            trans.Commit();
        }

        public HashSet<string> GetWarningGuids()
        {
            return _warningGuids;
        }
    }
}
