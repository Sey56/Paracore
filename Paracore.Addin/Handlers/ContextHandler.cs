using CoreScript;
using CoreScript.Engine.Core;
using CoreScript.Engine.Logging;
using Paracore.Addin.Context;
using Paracore.Addin.Helpers;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Paracore.Addin.Handlers
{
    public class ContextHandler
    {
        private readonly UIApplication? _uiApp;
        private readonly ILogger _logger;
        private readonly IParameterExtractor _parameterExtractor;

        public ContextHandler(UIApplication? uiApp, ILogger logger, IParameterExtractor parameterExtractor)
        {
            _uiApp = uiApp;
            _logger = logger;
            _parameterExtractor = parameterExtractor;
        }

        public GetStatusResponse GetStatus()
        {
            _logger.Log("[ContextHandler] Entering GetStatus.", LogLevel.Debug);
            bool revitOpen = _uiApp != null;
            string? revitVersion = revitOpen ? _uiApp.Application?.VersionNumber : null;
            bool documentOpen = revitOpen && _uiApp.ActiveUIDocument != null;
            string? documentTitle = documentOpen ? _uiApp.ActiveUIDocument?.Document?.Title : null;

            string documentType = "None";
            if (documentOpen && _uiApp.ActiveUIDocument.Document is Document doc)
            {
                if (doc.IsFamilyDocument)
                {
                    var family = new FilteredElementCollector(doc).OfClass(typeof(Family)).FirstOrDefault() as Family;
                    if (family?.FamilyCategory?.Id != null && family.FamilyCategory.Id.Value == (long)BuiltInCategory.OST_Mass)
                        documentType = "ConceptualMass";
                    else
                        documentType = "Family";
                }
                else documentType = "Project";
            }

            var status = new GetStatusResponse
            {
                ParacoreConnected = true,
                RevitOpen = revitOpen,
                RevitVersion = revitVersion ?? "",
                DocumentOpen = documentOpen,
                DocumentTitle = documentTitle ?? "",
                DocumentType = documentType,
                RevitInstallPath = App.ParacoreApp.RevitInstallPath,
                AddinServerPath = System.IO.Path.GetDirectoryName(typeof(App.ParacoreApp).Assembly.Location) ?? ""
            };

            _logger.Log($"[ContextHandler] Revit Status: Open={revitOpen}, Version={revitVersion}, DocOpen={documentOpen}, DocTitle='{documentTitle}', DocType={documentType}.", LogLevel.Debug);
            return status;
        }

        public async Task<GetModelCategoriesResponse> GetModelCategories(GetModelCategoriesRequest request)
        {
            _logger.Log("[ContextHandler] Fetching all model categories on demand.", LogLevel.Info);
            var response = new GetModelCategoriesResponse();
            if (_uiApp?.ActiveUIDocument == null) return response;

            try
            {
                await CoreScript.Engine.Runtime.CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(() =>       
                {
                    var doc = _uiApp.ActiveUIDocument.Document;
                    var bics = Enum.GetValues(typeof(BuiltInCategory)).Cast<BuiltInCategory>();
                    var categories = bics
                        .Where(bic => bic.ToString().StartsWith("OST_"))
                        .Select(bic => {
                            try {
                                var cat = doc.Settings.Categories.get_Item(bic);
                                if (cat == null || string.IsNullOrEmpty(cat.Name)) return null;
                                return new { Id = bic.ToString(), Label = cat.Name };
                            } catch { return null; }
                        })
                        .Where(x => x != null).GroupBy(x => x!.Label).Select(g => g.First()).OrderBy(x => x!.Label).ToList();

                    foreach (var c in categories) response.Categories.Add(new CoreScript.CategoryInfo { Id = c!.Id, Label = c!.Label });        
                    return true;
                });
            }
            catch (Exception ex) { response.ErrorMessage = ex.Message; }
            return response;
        }

        public async Task<GetContextResponse> GetContext()
        {
            _logger.Log("[ContextHandler] Entering GetContext.", LogLevel.Debug);
            if (_uiApp == null) return new GetContextResponse();

            try
            {
                return await CoreScript.Engine.Runtime.CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(() =>
                {
                    var response = new GetContextResponse();
                    var uidoc = _uiApp.ActiveUIDocument;
                    if (uidoc == null) return response;

                    var doc = uidoc.Document;
                    response.ActiveViewName = uidoc.ActiveView?.Name ?? "Unknown";
                    response.ActiveViewType = uidoc.ActiveView?.ViewType.ToString() ?? "Unknown";
                    var selection = uidoc.Selection.GetElementIds();
                    response.SelectionCount = selection.Count;
                    response.SelectedElementIds.AddRange(selection.Select(id => (int)id.Value));

                    foreach (var id in selection)
                    {
                        var element = doc.GetElement(id);
                        if (element != null) response.SelectedElements.Add(new CoreScript.ElementInfo { Id = (int)id.Value, Category = element.Category?.Name ?? "Unknown" });
                    }

                    if (doc.ProjectInformation != null)
                    {
                        response.ProjectInfo = new CoreScript.ProjectInfo { Name = doc.ProjectInformation.Name ?? "", Title = doc.Title, FilePath = doc.PathName, IsWorkshared = doc.IsWorkshared, Username = _uiApp.Application.Username };
                    }

                    var levels = new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>().ToList();
                    foreach (var level in levels) response.Levels.Add(new CoreScript.LevelInfo { Id = (int)level.Id.Value, Name = level.Name, Elevation = level.Elevation });
                    return response;
                });
            }
            catch { return new GetContextResponse(); }
        }

        public async Task<ValidateWorkingSetResponse> ValidateWorkingSet(ValidateWorkingSetRequest request)
        {
            var response = new ValidateWorkingSetResponse();
            if (_uiApp == null) return response;

            try
            {
                var validIds = await CoreScript.Engine.Runtime.CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(() =>
                {
                    var uidoc = _uiApp.ActiveUIDocument;
                    if (uidoc == null) return new List<long>();
                    var doc = uidoc.Document;
                    return request.ElementIds.Where(id => doc.GetElement(new ElementId(id)) != null).ToList();
                });
                if (validIds != null) response.ValidElementIds.AddRange(validIds);
            }
            catch { }
            return response;
        }

        public async Task<ComputeParameterOptionsResponse> ComputeParameterOptions(ComputeParameterOptionsRequest request)
        {
            var response = new ComputeParameterOptionsResponse { IsSuccess = false };
            if (_uiApp == null) return response;

            try
            {
                var result = await CoreScript.Engine.Runtime.CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(() =>
                {
                    var serverContext = new ServerContext(_uiApp, isReadOnly: true);
                    var parameters = _parameterExtractor.ExtractParameters(request.ScriptContent);
                    var targetParam = parameters.FirstOrDefault(p => p.Name == request.ParameterName);
                    if (targetParam == null) return new List<string>();

                    var optionsExecutor = new ParameterOptionsExecutor(_logger, new ParameterService());
                    if (optionsExecutor.HasOptionsFunction(request.ScriptContent, request.ParameterName))
                    {
                        string parametersJson = request.ParametersJson != null ? request.ParametersJson.ToStringUtf8() : "";
                        return optionsExecutor.ExecuteOptionsFunction(request.ScriptContent, request.ParameterName, serverContext, parametersJson, parameters).GetAwaiter().GetResult() ?? new List<string>();
                    }

                    if (targetParam.IsRevitElement && !string.IsNullOrEmpty(targetParam.RevitElementType))
                    {
                        return new ParameterOptionsComputer(_uiApp.ActiveUIDocument.Document).ComputeOptions(targetParam.RevitElementType, targetParam.RevitElementCategory);
                    }
                    return new List<string>();
                });

                if (result != null) { response.Options.AddRange(result); response.IsSuccess = true; }
            }
            catch (Exception ex) { response.ErrorMessage = ex.Message; }
            return response;
        }

        public async Task<SelectElementsResponse> SelectElements(SelectElementsRequest request)
        {
            var response = new SelectElementsResponse { IsSuccess = false };
            if (_uiApp == null) return response;

            try
            {
                await CoreScript.Engine.Runtime.CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(() =>       
                {
                    var uidoc = _uiApp.ActiveUIDocument;
                    if (uidoc == null) throw new Exception("No active document.");
                    var ids = request.ElementIds.Select(id => new ElementId(id)).ToList();
                    uidoc.Selection.SetElementIds(ids);
                    if (ids.Count > 0) uidoc.ShowElements(ids.First());
                    return true;
                });
                response.IsSuccess = true;
            }
            catch (Exception ex) { response.ErrorMessage = ex.Message; }
            return response;
        }

        public async Task<PickObjectResponse> PickObject(PickObjectRequest request)
        {
            var response = new PickObjectResponse { IsSuccess = false, Cancelled = false };
            if (_uiApp == null) return response;

            try
            {
                var result = await CoreScript.Engine.Runtime.CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(() =>
                {
                    var uidoc = _uiApp.ActiveUIDocument;
                    if (uidoc == null) throw new Exception("No active document.");

                    try
                    {
                        if (request.SelectionType.Equals("Point", StringComparison.OrdinalIgnoreCase))
                        {
                            XYZ point = uidoc.Selection.PickPoint("Pick a point");
                            return $"{point.X},{point.Y},{point.Z}";
                        }
                        
                        // Resolve Selection Type
                        var objType = Autodesk.Revit.UI.Selection.ObjectType.Element;
                        if (request.SelectionType.Equals("Face", StringComparison.OrdinalIgnoreCase)) objType = Autodesk.Revit.UI.Selection.ObjectType.Face;
                        else if (request.SelectionType.Equals("Edge", StringComparison.OrdinalIgnoreCase)) objType = Autodesk.Revit.UI.Selection.ObjectType.Edge;

                        // Resolve Filter
                        var (categoryId, classType) = ResolveFilter(uidoc.Document, request.CategoryFilter);
                        var filter = (categoryId != null || classType != null) ? new UniversalSelectionFilter(categoryId, classType) : null;

                        var reference = uidoc.Selection.PickObject(objType, filter, $"Pick {request.SelectionType} {request.CategoryFilter}");
                        
                        if (objType == Autodesk.Revit.UI.Selection.ObjectType.Element)
                            return reference.ElementId.Value.ToString();
                        
                        return reference.ConvertToStableRepresentation(uidoc.Document);
                    }
                    catch (Autodesk.Revit.Exceptions.OperationCanceledException) { return "CANCELLED"; }
                });

                if (result == "CANCELLED") { response.Cancelled = true; response.IsSuccess = false; }
                else { response.Value = result; response.IsSuccess = true; }
            }
            catch (Exception ex) { response.ErrorMessage = ex.Message; }
            return response;
        }

        private (ElementId? CategoryId, Type? ClassType) ResolveFilter(Document doc, string filter)
        {
            if (string.IsNullOrEmpty(filter)) return (null, null);

            // 1. Try BuiltInCategory (Stable ID)
            if (Enum.TryParse<BuiltInCategory>(filter, true, out var bic)) return (new ElementId(bic), null);
            if (!filter.StartsWith("OST_") && Enum.TryParse<BuiltInCategory>("OST_" + filter, true, out bic)) return (new ElementId(bic), null);

            // 2. Try Revit Class Type (e.g. Wall, Floor)
            var revitType = typeof(Element).Assembly.GetType("Autodesk.Revit.DB." + filter);
            if (revitType != null) return (null, revitType);

            // 3. Fallback: Search categories by display name (Language dependent)
            foreach (Category cat in doc.Settings.Categories)
            {
                if (cat.Name.Equals(filter, StringComparison.OrdinalIgnoreCase)) return (cat.Id, null);
            }

            return (null, null);
        }

        public async Task<GetCategoryParametersResponse> GetCategoryParameters(GetCategoryParametersRequest request)  
        {
            _logger.Log($"[ContextHandler] Entering GetCategoryParameters for: {request.CategoryName}", LogLevel.Debug);
            var response = new GetCategoryParametersResponse();
            if (_uiApp == null || _uiApp.ActiveUIDocument == null) { response.ErrorMessage = "Revit not active"; return response; }

            try
            {
                await CoreScript.Engine.Runtime.CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(() =>       
                {
                    var doc = _uiApp.ActiveUIDocument.Document;
                    if (!Enum.TryParse<BuiltInCategory>(request.CategoryName, out var bic)) {
                        if (!request.CategoryName.StartsWith("OST_") && Enum.TryParse<BuiltInCategory>("OST_" + request.CategoryName, out bic)) { }
                        else { response.ErrorMessage = "Invalid Category"; return false; }
                    }

                    var sample = new FilteredElementCollector(doc).OfCategory(bic).WhereElementIsNotElementType().FirstOrDefault();
                    var parametersWithSource = new List<(Parameter Param, bool IsType)>();

                    if (sample != null) {
                        foreach (Parameter p in sample.Parameters) parametersWithSource.Add((p, false));
                        var typeId = sample.GetTypeId();
                        if (typeId != ElementId.InvalidElementId) {
                            var typeElement = doc.GetElement(typeId);
                            if (typeElement != null) foreach (Parameter p in typeElement.Parameters) parametersWithSource.Add((p, true));
                        }
                    } else {
                        var sampleType = new FilteredElementCollector(doc).OfCategory(bic).WhereElementIsElementType().FirstOrDefault();
                        if (sampleType != null) foreach (Parameter p in sampleType.Parameters) parametersWithSource.Add((p, true));
                    }

                    var allParams = parametersWithSource.GroupBy(x => x.Param.Id).Select(g => g.First()).ToList();
                    var nameGroups = allParams.GroupBy(x => x.Param.Definition.Name).ToList();
                    var disambiguatedNames = new Dictionary<ElementId, string>();

                    foreach (var group in nameGroups) {
                        var list = group.ToList();
                        if (list.Count == 1) disambiguatedNames[list[0].Param.Id] = list[0].Param.Definition.Name;
                        else {
                            foreach (var item in list) {
                                string suffix = item.Param.StorageType == StorageType.ElementId ? "Reference" : item.Param.StorageType.ToString();
                                disambiguatedNames[item.Param.Id] = $"{item.Param.Definition.Name} [{suffix}]";
                            }
                        }
                    }

                    bool isLoadable = false;
                    if (sample != null) {
                        var typeId = sample.GetTypeId();
                        if (typeId != ElementId.InvalidElementId) {
                            var typeElement = doc.GetElement(typeId);
                            if (typeElement is FamilySymbol) isLoadable = true;
                        }
                    } else {
                        var sampleType = new FilteredElementCollector(doc).OfCategory(bic).WhereElementIsElementType().FirstOrDefault();
                        if (sampleType is FamilySymbol) isLoadable = true;
                    }

                    foreach (var item in allParams.OrderBy(x => disambiguatedNames[x.Param.Id])) {
                        var p = item.Param;
                        
                        // CRITICAL UX FIX: Filter out redundant Category/Family parameters from VQB list
                        string lowName = p.Definition.Name.ToLower();
                        if (lowName == "category" || lowName == "element category") continue;

                        // Family parameter for system categories (Walls, Floors, etc.) is confusing 
                        // as it often returns IDs that don't point to selectable Family elements.
                        // We ONLY show Family filter for truly loadable families.
                        if (p.Id.Value == (long)BuiltInParameter.ELEM_FAMILY_PARAM && !isLoadable) continue;

                        string specId = ""; try { specId = p.Definition.GetDataType().TypeId; } catch { }
                        var def = new ParameterDefinition {
                            Name = disambiguatedNames[p.Id], StorageType = p.StorageType.ToString(),
                            IsBuiltin = p.IsShared == false && p.Id.Value < 0, BuiltinId = (int)p.Id.Value,
                            SpecTypeId = specId, IsType = item.IsType
                        };
                        if (def.IsBuiltin) def.BuiltinName = ((BuiltInParameter)def.BuiltinId).ToString();

                        if (p.StorageType == StorageType.ElementId) {
                            string typeName = "Element";
                            string name = p.Definition.Name.ToLower();
                            
                            // If this is the Family parameter and it's loadable, we want the Family collector
                            if (p.Id.Value == (long)BuiltInParameter.ELEM_FAMILY_PARAM && isLoadable) {
                                typeName = "Family";
                            }
                            else if (name.Contains("category")) typeName = "Category";
                            else if (name.Contains("level") || name.Contains("constraint")) typeName = "Level";
                            else if (name.Contains("material")) typeName = "Material";
                            else if (name.Contains("type")) typeName = "ElementType";
                            else if (name.Contains("phase")) typeName = "Phase";
                            else if (name.Contains("view")) typeName = "View";
                            
                            def.RevitElementType = typeName;
                        }
                        response.Parameters.Add(def);
                    }
                    return true;
                });
            }
            catch (Exception ex) { response.ErrorMessage = ex.Message; }
            return response;
        }

        public async Task<UpdateElementParameterResponse> UpdateElementParameter(UpdateElementParameterRequest request)
        {
            var response = new UpdateElementParameterResponse { IsSuccess = false };
            if (_uiApp == null) return response;

            try
            {
                await CoreScript.Engine.Runtime.CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(() =>       
                {
                    var doc = _uiApp.ActiveUIDocument.Document;
                    var element = doc.GetElement(new ElementId(request.ElementId));
                    if (element == null) throw new Exception($"Element {request.ElementId} not found.");      

                    // --- PRECISION FUZZY RESOLVER ---
                    string searchName = request.ParameterName.Replace(" ", "").ToLowerInvariant();
                    Parameter? targetParam = element.LookupParameter(request.ParameterName);
                    
                    if (targetParam == null) {
                        foreach (Parameter p in element.Parameters) {
                            if (p.Definition.Name.Replace(" ", "").ToLowerInvariant() == searchName) { targetParam = p; break; }
                        }
                    }

                    if (targetParam == null) {
                        var typeId = element.GetTypeId();
                        if (typeId != ElementId.InvalidElementId) {
                            var typeElement = doc.GetElement(typeId);
                            if (typeElement != null) {
                                targetParam = typeElement.LookupParameter(request.ParameterName);
                                if (targetParam == null) {
                                    foreach (Parameter p in typeElement.Parameters) {
                                        if (p.Definition.Name.Replace(" ", "").ToLowerInvariant() == searchName) { targetParam = p; break; }
                                    }
                                }
                            }
                        }
                    }

                    if (targetParam == null) throw new Exception($"Parameter '{request.ParameterName}' not found.");
                    if (targetParam.IsReadOnly) throw new Exception($"Parameter '{targetParam.Definition.Name}' is read-only.");

                    using (Transaction t = new Transaction(doc, $"Update {targetParam.Definition.Name}"))
                    {
                        t.Start();
                        if (targetParam.StorageType == StorageType.String) targetParam.Set(request.NewValueString ?? "");
                        else if (targetParam.StorageType == StorageType.Integer) targetParam.Set(int.Parse(request.NewValueString));
                        else if (targetParam.StorageType == StorageType.ElementId) targetParam.Set(new ElementId(long.Parse(request.NewValueString)));
                        else if (targetParam.StorageType == StorageType.Double) {
                            targetParam.Set(double.Parse(request.NewValueString));
                        }
                        t.Commit();
                    }
                    return true;
                });
                response.IsSuccess = true;
            }
            catch (Exception ex) { response.ErrorMessage = ex.Message; }
            return response;
        }

        public async Task<BatchUpdateElementParametersResponse> BatchUpdateElementParameters(BatchUpdateElementParametersRequest request)
        {
            var response = new BatchUpdateElementParametersResponse { IsSuccess = false };
            if (_uiApp == null) return response;

            try
            {
                await CoreScript.Engine.Runtime.CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(() =>       
                {
                    var doc = _uiApp.ActiveUIDocument.Document;
                    using (Transaction t = new Transaction(doc, "Paracore: Batch Update"))
                    {
                        t.Start();
                        int processedCount = 0;
                        foreach (var update in request.Updates)
                        {
                            var element = doc.GetElement(new ElementId(update.ElementId));
                            if (element == null) continue;

                            string searchName = update.ParameterName.Replace(" ", "").ToLowerInvariant();
                            Parameter? targetParam = element.LookupParameter(update.ParameterName);
                            
                            if (targetParam == null) {
                                foreach (Parameter p in element.Parameters) {
                                    if (p.Definition.Name.Replace(" ", "").ToLowerInvariant() == searchName) { targetParam = p; break; }
                                }
                            }

                            if (targetParam != null && !targetParam.IsReadOnly) {
                                if (targetParam.StorageType == StorageType.String) targetParam.Set(update.NewValueString ?? "");
                                else if (targetParam.StorageType == StorageType.Integer) targetParam.Set(int.Parse(update.NewValueString));
                                else if (targetParam.StorageType == StorageType.ElementId) targetParam.Set(new ElementId(long.Parse(update.NewValueString)));
                                else if (targetParam.StorageType == StorageType.Double) {
                                    targetParam.Set(double.Parse(update.NewValueString));
                                }
                                processedCount++;
                            }
                        }
                        t.Commit();
                        response.Count = processedCount;
                    }
                    return true;
                });
                response.IsSuccess = true;
            }
            catch (Exception ex) { response.ErrorMessage = ex.Message; }
            return response;
        }
    }
}
