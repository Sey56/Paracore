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
                    {
                        documentType = "ConceptualMass";
                    }
                    else
                    {
                        documentType = "Family";
                    }
                }
                else
                {
                    documentType = "Project";
                }
            }

            var status = new GetStatusResponse
            {
                ParacoreConnected = true,
                RevitOpen = revitOpen,
                RevitVersion = revitVersion ?? "",
                DocumentOpen = documentOpen,
                DocumentTitle = documentTitle ?? "",
                DocumentType = documentType
            };

            _logger.Log($"[ContextHandler] Revit Status: Open={revitOpen}, Version={revitVersion}, DocOpen={documentOpen}, DocTitle='{documentTitle}', DocType={documentType}.", LogLevel.Debug);
            return status;
        }

        public async Task<GetModelCategoriesResponse> GetModelCategories(GetModelCategoriesRequest request)
        {
            _logger.Log("[ContextHandler] Fetching all model categories on demand.", LogLevel.Info);
            var response = new GetModelCategoriesResponse();

            if (_uiApp?.ActiveUIDocument == null)
            {
                response.ErrorMessage = "Revit document is not active.";
                return response;
            }

            try
            {
                await CoreScript.Engine.Runtime.CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(() =>
                {
                    var doc = _uiApp.ActiveUIDocument.Document;
                    var bics = Enum.GetValues(typeof(BuiltInCategory)).Cast<BuiltInCategory>();
                    
                    // Filter and map to a clean list
                    var categories = bics
                        .Where(bic => bic.ToString().StartsWith("OST_")) // Standard categories only
                        .Select(bic => {
                            try {
                                var cat = doc.Settings.Categories.get_Item(bic);
                                if (cat == null || string.IsNullOrEmpty(cat.Name)) return null;
                                return new { Id = bic.ToString(), Label = cat.Name };
                            } catch { return null; }
                        })
                        .Where(x => x != null)
                        // Group by label to avoid duplicates like "Hidden Lines" appearing multiple times
                        .GroupBy(x => x!.Label)
                        .Select(g => g.First())
                        .OrderBy(x => x!.Label)
                        .ToList();

                    foreach (var c in categories)
                    {
                        response.Categories.Add(new CoreScript.CategoryInfo { Id = c!.Id, Label = c!.Label });
                    }
                    return true;
                });
            }
            catch (Exception ex)
            {
                response.ErrorMessage = ex.Message;
            }

            return response;
        }

        public async Task<GetContextResponse> GetContext()
        {
            _logger.Log("[ContextHandler] Entering GetContext.", LogLevel.Debug);
            if (_uiApp == null)
            {
                _logger.Log("[ContextHandler] UIApplication is null.", LogLevel.Warning);
                return new GetContextResponse();
            }

            try
            {
                var result = await CoreScript.Engine.Runtime.CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(() =>
                {
                    var response = new GetContextResponse();
                    var uidoc = _uiApp.ActiveUIDocument;
                    if (uidoc == null)
                    {
                        _logger.Log("[ContextHandler] ActiveUIDocument is null inside UI context.", LogLevel.Warning);
                        return response;
                    }

                    var doc = uidoc.Document;
                    response.ActiveViewName = uidoc.ActiveView?.Name ?? "Unknown";
                    response.ActiveViewType = uidoc.ActiveView?.ViewType.ToString() ?? "Unknown";
                    response.ActiveViewScale = uidoc.ActiveView?.Scale ?? 0;
                    response.ActiveViewDetailLevel = uidoc.ActiveView?.DetailLevel.ToString() ?? "Unknown";
                    var selection = uidoc.Selection.GetElementIds();
                    response.SelectionCount = selection.Count;
                    response.SelectedElementIds.AddRange(selection.Select(id => (int)id.Value));

                    foreach (var id in selection)
                    {
                        var element = doc.GetElement(id);
                        if (element != null)
                        {
                            var elementInfo = new CoreScript.ElementInfo
                            {
                                Id = (int)id.Value,
                                Category = element.Category?.Name ?? "Unknown"
                            };
                            response.SelectedElements.Add(elementInfo);
                        }
                    }

                    if (doc.ProjectInformation != null)
                    {
                        response.ProjectInfo = new CoreScript.ProjectInfo
                        {
                            Name = doc.ProjectInformation.Name ?? "",
                            Number = doc.ProjectInformation.Number ?? "",
                            Title = doc.Title,
                            FilePath = doc.PathName,
                            IsWorkshared = doc.IsWorkshared,
                            Username = _uiApp.Application.Username
                        };
                    }

                    var levels = new FilteredElementCollector(doc)
                        .OfClass(typeof(Level))
                        .Cast<Level>()
                        .ToList();

                    foreach (var level in levels)
                    {
                        response.Levels.Add(new CoreScript.LevelInfo
                        {
                            Id = (int)level.Id.Value,
                            Name = level.Name,
                            Elevation = level.Elevation
                        });
                    }

                    return response;
                });
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError($"[ContextHandler] Error in GetContext: {ex.Message}");
                return new GetContextResponse();
            }
        }

        public async Task<ValidateWorkingSetResponse> ValidateWorkingSet(ValidateWorkingSetRequest request)
        {
            var response = new ValidateWorkingSetResponse();
            if (_uiApp == null)
            {
                _logger.Log("[ContextHandler] ValidateWorkingSet: UIApplication is null.", LogLevel.Warning);
                return response;
            }

            try
            {
                var validIds = await CoreScript.Engine.Runtime.CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(() =>
                {
                    var uidoc = _uiApp.ActiveUIDocument;
                    if (uidoc == null)
                    {
                        _logger.Log("[ContextHandler] ValidateWorkingSet: ActiveUIDocument is null.", LogLevel.Warning);
                        return new List<long>();
                    }

                    var doc = uidoc.Document;
                    var currentlyValidIds = new List<long>();
                    foreach (var id in request.ElementIds)
                    {
                        var element = doc.GetElement(new ElementId(id));
                        if (element != null)
                        {
                            currentlyValidIds.Add(id);
                        }
                    }
                    return currentlyValidIds;
                });

                if (validIds != null)
                {
                    response.ValidElementIds.AddRange(validIds);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError($"[ContextHandler] Error in ValidateWorkingSet: {ex.Message}");
            }
            return response;
        }

        public async Task<ComputeParameterOptionsResponse> ComputeParameterOptions(ComputeParameterOptionsRequest request)
        {
            _logger.Log($"[ContextHandler] Entering ComputeParameterOptions for parameter: {request.ParameterName}", LogLevel.Debug);
            var response = new ComputeParameterOptionsResponse { IsSuccess = false };
            
            if (_uiApp == null)
            {
                response.ErrorMessage = "Revit UI Application is not available.";
                return response;
            }

            if (string.IsNullOrWhiteSpace(request.ScriptContent))
            {
                response.ErrorMessage = "Script content is empty.";
                return response;
            }

            if (string.IsNullOrWhiteSpace(request.ParameterName))
            {
                response.ErrorMessage = "Parameter name is empty.";
                return response;
            }

            try
            {
                var result = await CoreScript.Engine.Runtime.CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(() =>
                {
                    var serverContext = new ServerContext(_uiApp, isReadOnly: true);
                    var parameters = _parameterExtractor.ExtractParameters(request.ScriptContent);
                    var targetParam = parameters.FirstOrDefault(p => p.Name == request.ParameterName);
                    
                    if (targetParam == null) return new List<string>();

                    var optionsExecutor = new ParameterOptionsExecutor(_logger);
                    if (optionsExecutor.HasOptionsFunction(request.ScriptContent, request.ParameterName))
                    {
                        try
                        {
                            string parametersJson = request.ParametersJson != null ? request.ParametersJson.ToStringUtf8() : "";
                            _logger.Log($"[ContextHandler] Incoming Parameters JSON: {parametersJson}", LogLevel.Debug);

                            if (optionsExecutor.HasRangeFunction(request.ScriptContent, request.ParameterName))
                            {
                                var range = optionsExecutor.ExecuteRangeFunction(
                                    request.ScriptContent,
                                    request.ParameterName,
                                    serverContext,
                                    parametersJson,
                                    parameters 
                                ).GetAwaiter().GetResult();

                                if (range.HasValue)
                                {
                                    response.Min = range.Value.Min;
                                    response.Max = range.Value.Max;
                                    response.Step = range.Value.Step;
                                    response.IsSuccess = true;
                                }
                            }

                            var options = optionsExecutor.ExecuteOptionsFunction(
                                request.ScriptContent,
                                request.ParameterName,
                                serverContext,
                                parametersJson,
                                parameters 
                            ).GetAwaiter().GetResult();
                            
                            return options ?? new List<string>();
                        }
                        catch (InvalidOperationException ex)
                        {
                            _logger.Log($"[ContextHandler] Options function error: {ex.Message}", LogLevel.Warning);
                            throw; 
                        }
                    }

                    if (targetParam.IsRevitElement && !string.IsNullOrEmpty(targetParam.RevitElementType))
                    {
                        var doc = _uiApp.ActiveUIDocument.Document;
                        var optionsComputer = new ParameterOptionsComputer(doc);
                        _logger.Log($"[ContextHandler] Using Automatic ParameterOptionsComputer for {targetParam.Name} (Type: {targetParam.RevitElementType})", LogLevel.Debug);
                        return optionsComputer.ComputeOptions(targetParam.RevitElementType, targetParam.RevitElementCategory);
                    }

                    return new List<string>();
                });

                if (result != null)
                {
                    if (result.Count > 0)
                    {
                        response.Options.AddRange(result);
                        _logger.Log($"[ContextHandler] Successfully computed {result.Count} options for {request.ParameterName}", LogLevel.Debug);
                    }
                    else
                    {
                        _logger.Log($"[ContextHandler] Successfully computed 0 options (Empty Result) for {request.ParameterName}", LogLevel.Debug);
                    }
                    response.IsSuccess = true;
                }
                else if (response.IsSuccess) 
                {
                    _logger.Log($"[ContextHandler] Successfully computed range for {request.ParameterName}", LogLevel.Debug);
                }
                else
                {
                    var parameters = _parameterExtractor.ExtractParameters(request.ScriptContent);
                    var targetParam = parameters.FirstOrDefault(p => p.Name == request.ParameterName);

                    response.IsSuccess = false;
                    
                    if (targetParam != null && targetParam.IsRevitElement && !string.IsNullOrEmpty(targetParam.RevitElementType))
                    {
                        string categoryMsg = string.IsNullOrEmpty(targetParam.RevitElementCategory) ? "" : $" in category '{targetParam.RevitElementCategory}'";
                        response.ErrorMessage = $"No elements of type '{targetParam.RevitElementType}'{categoryMsg} found in the current document.";
                    }
                    else
                    {
                        response.ErrorMessage = $"The options provider '{request.ParameterName}_Options' (or Range) returned no results.";
                    }

                    _logger.Log($"[ContextHandler] {response.ErrorMessage}", LogLevel.Warning);
                }
            }
            catch (Exception ex)
            {
                var innerException = ex;
                while (innerException.InnerException != null)
                {
                    innerException = innerException.InnerException;
                }
                
                string errorMessage = innerException.Message;
                _logger.LogError($"[ContextHandler] Error in ComputeParameterOptions: {errorMessage}");
                response.IsSuccess = false;
                response.ErrorMessage = errorMessage;
            }

            return response;
        }

        public async Task<SelectElementsResponse> SelectElements(SelectElementsRequest request)
        {
            _logger.Log($"[ContextHandler] Entering SelectElements. Target count: {request.ElementIds.Count}", LogLevel.Debug);
            var response = new SelectElementsResponse { IsSuccess = false };

            if (_uiApp == null)
            {
                response.ErrorMessage = "Revit UI Application is not available.";
                return response;
            }

            try
            {
                await CoreScript.Engine.Runtime.CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(() =>
                {
                    var uidoc = _uiApp.ActiveUIDocument;
                    if (uidoc == null) throw new Exception("No active document.");

                    var ids = request.ElementIds.Select(id => new ElementId(id)).ToList();
                    uidoc.Selection.SetElementIds(ids);
                    
                    if (ids.Count > 0)
                    {
                        uidoc.ShowElements(ids.First());
                    }
                    return true;
                });

                response.IsSuccess = true;
                _logger.Log("[ContextHandler] Selection updated successfully.", LogLevel.Debug);
            }
            catch (Exception ex)
            {
                _logger.LogError($"[ContextHandler] Selection failed: {ex.Message}");
                response.IsSuccess = false;
                response.ErrorMessage = ex.Message;
            }

            return response;
        }

        public async Task<PickObjectResponse> PickObject(PickObjectRequest request)
        {
            _logger.Log($"[ContextHandler] Entering PickObject. Type: {request.SelectionType}", LogLevel.Debug);
            var response = new PickObjectResponse { IsSuccess = false, Cancelled = false };

            if (_uiApp == null)
            {
                response.ErrorMessage = "Revit UI Application is not available.";
                return response;
            }

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
                        else
                        {
                            Autodesk.Revit.UI.Selection.ObjectType objType = Autodesk.Revit.UI.Selection.ObjectType.Element;
                            
                            if (request.SelectionType.Equals("Face", StringComparison.OrdinalIgnoreCase)) 
                                objType = Autodesk.Revit.UI.Selection.ObjectType.Face;
                            else if (request.SelectionType.Equals("Edge", StringComparison.OrdinalIgnoreCase)) 
                                objType = Autodesk.Revit.UI.Selection.ObjectType.Edge;
                            else if (request.SelectionType.Equals("PointOnElement", StringComparison.OrdinalIgnoreCase)) 
                                objType = Autodesk.Revit.UI.Selection.ObjectType.PointOnElement;

                            Reference reference;
                            if (!string.IsNullOrEmpty(request.CategoryFilter))
                            {
                                string cleanName = request.CategoryFilter.Trim();
                                string singularName = cleanName.EndsWith("s", StringComparison.OrdinalIgnoreCase) 
                                                   ? cleanName.Substring(0, cleanName.Length - 1) 
                                                   : cleanName;

                                _logger.Log($"[ContextHandler] Resolving Category Filter: '{cleanName}'", LogLevel.Debug);
                                ElementId? targetCategoryId = null;

                                foreach (Category cat in uidoc.Document.Settings.Categories)
                                {
                                    if (cat.Name.Equals(cleanName, StringComparison.OrdinalIgnoreCase) || 
                                        cat.Name.Equals($"{cleanName}s", StringComparison.OrdinalIgnoreCase) ||
                                        cat.Name.Equals(singularName, StringComparison.OrdinalIgnoreCase) ||
                                        cat.Name.Equals($"{singularName}s", StringComparison.OrdinalIgnoreCase))
                                    {
                                        targetCategoryId = cat.Id;
                                        _logger.Log($"[ContextHandler] Resolved '{cleanName}' via Name Match to ID: {targetCategoryId}", LogLevel.Debug);
                                        break;
                                    }
                                }

                                if (targetCategoryId == null)
                                {
                                    var categories = Enum.GetValues(typeof(BuiltInCategory)).Cast<BuiltInCategory>();
                                    var builtin = categories.FirstOrDefault(c => 
                                        c.ToString().Equals($"OST_{cleanName}", StringComparison.OrdinalIgnoreCase) ||
                                        c.ToString().Equals($"OST_{cleanName}s", StringComparison.OrdinalIgnoreCase) ||
                                        c.ToString().Equals($"OST_{singularName}", StringComparison.OrdinalIgnoreCase) ||
                                        c.ToString().Equals($"OST_{singularName}s", StringComparison.OrdinalIgnoreCase));

                                    if (builtin != default)
                                    {
                                        targetCategoryId = new ElementId(builtin);
                                        _logger.Log($"[ContextHandler] Resolved '{cleanName}' via BuiltInCategory to ID: {targetCategoryId}", LogLevel.Debug);
                                    }
                                }

                                Type? targetType = null;
                                if (targetCategoryId == null)
                                {
                                    var revitAssembly = typeof(Element).Assembly;
                                    targetType = revitAssembly.GetTypes().FirstOrDefault(t => 
                                        typeof(Element).IsAssignableFrom(t) && 
                                        (t.Name.Equals(cleanName, StringComparison.OrdinalIgnoreCase) || t.Name.Equals(singularName, StringComparison.OrdinalIgnoreCase)));
                                    
                                    if (targetType != null)
                                    {
                                        _logger.Log($"[ContextHandler] Resolved '{cleanName}' via Class Type to: {targetType.Name}", LogLevel.Debug);
                                    }
                                }

                                if (targetCategoryId != null || targetType != null)
                                {
                                    var filter = new UniversalSelectionFilter(targetCategoryId, targetType);
                                    reference = uidoc.Selection.PickObject(objType, filter, $"Pick {request.SelectionType} ({request.CategoryFilter})");
                                }
                                else
                                {
                                    _logger.Log($"[ContextHandler] Category filter '{request.CategoryFilter}' NOT FOUND in document. Falling back to all.", LogLevel.Warning);
                                    reference = uidoc.Selection.PickObject(objType, $"Pick {request.SelectionType}");
                                }
                            }
                            else
                            {
                                _logger.Log("[ContextHandler] No Category Filter provided. Allowing all elements.", LogLevel.Debug);
                                reference = uidoc.Selection.PickObject(objType, $"Pick {request.SelectionType}");
                            }
                            
                            if (objType == Autodesk.Revit.UI.Selection.ObjectType.Element)
                            {
                                return reference.ElementId.Value.ToString();
                            }
                            else
                            {
                                return reference.ConvertToStableRepresentation(uidoc.Document);
                            }
                        }
                    }
                    catch (Autodesk.Revit.Exceptions.OperationCanceledException)
                    {
                        return "CANCELLED"; 
                    }
                });

                if (result == "CANCELLED")
                {
                    response.Cancelled = true;
                    response.IsSuccess = false;
                }
                else
                {
                    response.Value = result;
                    response.IsSuccess = true;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError($"[ContextHandler] PickObject failed: {ex.Message}");
                response.IsSuccess = false;
                response.ErrorMessage = ex.Message;
            }

            return response;
        }

        public async Task<GetCategoryParametersResponse> GetCategoryParameters(GetCategoryParametersRequest request)
        {
            _logger.Log($"[ContextHandler] Entering GetCategoryParameters for: {request.CategoryName}", LogLevel.Debug);
            var response = new GetCategoryParametersResponse();

            if (_uiApp == null || _uiApp.ActiveUIDocument == null)
            {
                response.ErrorMessage = "Revit is not available.";
                return response;
            }

            try
            {
                await CoreScript.Engine.Runtime.CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(() =>
                {
                    var doc = _uiApp.ActiveUIDocument.Document;
                    
                    // 1. Resolve BuiltInCategory
                    if (!Enum.TryParse<BuiltInCategory>(request.CategoryName, out var bic))
                    {
                        // Try adding OST_ prefix if missing
                        if (!request.CategoryName.StartsWith("OST_") && Enum.TryParse<BuiltInCategory>("OST_" + request.CategoryName, out bic))
                        {
                            // Found with prefix
                        }
                        else
                        {
                            response.ErrorMessage = $"Category '{request.CategoryName}' is not a valid BuiltInCategory.";
                            return false;
                        }
                    }

                    // 2. Find a sample element
                    var sampleElement = new FilteredElementCollector(doc)
                        .OfCategory(bic)
                        .WhereElementIsNotElementType()
                        .FirstOrDefault();

                    var parametersWithSource = new List<(Parameter Param, bool IsType)>();
                    _logger.Log($"[ContextHandler] Discovering parameters for {bic}...", LogLevel.Debug);
                    if (sampleElement != null)
                    {
                        // Instance parameters
                        foreach (Parameter p in sampleElement.Parameters)
                        {
                            parametersWithSource.Add((p, false));
                        }

                        // Type parameters
                        var typeId = sampleElement.GetTypeId();
                        if (typeId != ElementId.InvalidElementId)
                        {
                            var typeElement = doc.GetElement(typeId);
                            if (typeElement != null)
                            {
                                foreach (Parameter p in typeElement.Parameters)
                                {
                                    parametersWithSource.Add((p, true));
                                }
                            }
                        }
                    }
                    else
                    {
                        // Fallback: If no instance exists, try to find a type element
                        var sampleType = new FilteredElementCollector(doc)
                            .OfCategory(bic)
                            .WhereElementIsElementType()
                            .FirstOrDefault();
                        
                        if (sampleType != null)
                        {
                            foreach (Parameter p in sampleType.Parameters)
                            {
                                parametersWithSource.Add((p, true));
                            }
                        }
                    }

                    // 3. Extract definitions and resolve name collisions
                    var allParamsWithMetadata = parametersWithSource
                        .GroupBy(x => x.Param.Id) // Deduplicate by exact Revit Parameter ID first
                        .Select(g => g.First())
                        .ToList();

                    _logger.Log($"[ContextHandler] Found {allParamsWithMetadata.Count} unique parameters.", LogLevel.Debug);

                    var nameGroups = allParamsWithMetadata.GroupBy(x => x.Param.Definition.Name).ToList();
                    
                    var finalizedWithMetadata = new List<(Parameter Param, bool IsType)>();
                    var disambiguatedNames = new Dictionary<ElementId, string>();

                    foreach (var group in nameGroups)
                    {
                        var groupList = group.ToList();
                        if (groupList.Count == 1)
                        {
                            var item = groupList[0];
                            finalizedWithMetadata.Add(item);
                            disambiguatedNames[item.Param.Id] = item.Param.Definition.Name;
                        }
                        else
                        {
                            // Collision detected
                            foreach (var item in groupList)
                            {
                                finalizedWithMetadata.Add(item);
                                
                                string suffix = item.Param.StorageType.ToString();
                                if (item.Param.StorageType == StorageType.ElementId)
                                {
                                     suffix = "Reference"; 
                                }
                                
                                disambiguatedNames[item.Param.Id] = $"{item.Param.Definition.Name} [{suffix}]";
                            }
                        }
                    }

                    var sortedMeta = finalizedWithMetadata.OrderBy(x => disambiguatedNames[x.Param.Id]);

                    foreach (var item in sortedMeta)
                    {
                        var p = item.Param;
                        string specId = "";
                        try {
                            specId = p.Definition.GetDataType().TypeId;
                        } catch { }

                        var def = new ParameterDefinition
                        {
                            Name = disambiguatedNames[p.Id], 
                            StorageType = p.StorageType.ToString(),
                            IsBuiltin = p.IsShared == false && p.Id.Value < 0,
                            BuiltinId = (int)p.Id.Value,
                            SpecTypeId = specId,
                            IsType = item.IsType
                        };

                        if (def.IsBuiltin)
                        {
                            def.BuiltinName = ((BuiltInParameter)def.BuiltinId).ToString();
                        }

                        // Resolve Revit element type for ElementId parameters
                        if (p.StorageType == StorageType.ElementId)
                        {
                            string typeName = "Element";
                            string name = p.Definition.Name.ToLower();
                            
                            if (name.Contains("level") || name.Contains("constraint")) typeName = "Level";
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
            catch (Exception ex)
            {
                _logger.LogError($"[ContextHandler] GetCategoryParameters failed: {ex.Message}");
                response.ErrorMessage = ex.Message;
            }

            return response;
        }

        public async Task<UpdateElementParameterResponse> UpdateElementParameter(UpdateElementParameterRequest request)
        {
            _logger.Log($"[ContextHandler] Entering UpdateElementParameter. ElementId: {request.ElementId}, Param: {request.ParameterName}, Value: {request.NewValueString}", LogLevel.Debug);
            var response = new UpdateElementParameterResponse { IsSuccess = false };

            if (_uiApp == null)
            {
                response.ErrorMessage = "Revit UI Application is not available.";
                return response;
            }

            try
            {
                await CoreScript.Engine.Runtime.CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(() =>
                {
                    var uidoc = _uiApp.ActiveUIDocument;
                    if (uidoc == null) throw new Exception("No active document.");

                    var doc = uidoc.Document;
                    var element = doc.GetElement(new ElementId(request.ElementId));
                    if (element == null) throw new Exception($"Element with ID {request.ElementId} not found.");

                    Parameter? targetParam = element.LookupParameter(request.ParameterName);
                    
                    if (targetParam == null)
                    {
                        foreach (Parameter p in element.Parameters)
                        {
                            if (p.Definition.Name.Equals(request.ParameterName, StringComparison.OrdinalIgnoreCase))
                            {
                                targetParam = p;
                                break;
                            }
                        }
                    }

                    if (targetParam == null) throw new Exception($"Parameter '{request.ParameterName}' not found on element {request.ElementId}.");
                    if (targetParam.IsReadOnly) throw new Exception($"Parameter '{request.ParameterName}' is read-only.");

                    using (Transaction t = new Transaction(doc, $"Paracore: Update {request.ParameterName}"))
                    {
                        t.Start();
                        bool setSuccess = false;
                        
                        switch (targetParam.StorageType)
                        {
                            case StorageType.String:
                                setSuccess = targetParam.Set(request.NewValueString ?? string.Empty);
                                break;
                            case StorageType.Integer:
                                if (int.TryParse(request.NewValueString, out int intVal))
                                    setSuccess = targetParam.Set(intVal);
                                else
                                    throw new Exception($"Cannot parse '{request.NewValueString}' as Integer.");
                                break;
                            case StorageType.Double:
                                if (double.TryParse(request.NewValueString, out double doubleVal))
                                    setSuccess = targetParam.Set(doubleVal);
                                else
                                    throw new Exception($"Cannot parse '{request.NewValueString}' as Double.");
                                break;
                            case StorageType.ElementId:
                                if (long.TryParse(request.NewValueString, out long idVal))
                                    setSuccess = targetParam.Set(new ElementId(idVal));
                                else
                                    throw new Exception($"Cannot parse '{request.NewValueString}' as ElementId.");
                                break;
                            default:
                                throw new Exception($"Unsupported StorageType {targetParam.StorageType} for parameter '{request.ParameterName}'.");
                        }

                        if (!setSuccess)
                        {
                            throw new Exception($"Failed to set parameter '{request.ParameterName}' to '{request.NewValueString}'. Value might be out of range or invalid for this parameter type.");
                        }

                        t.Commit();
                    }
                    return true;
                });

                response.IsSuccess = true;
                _logger.Log($"[ContextHandler] Successfully updated parameter '{request.ParameterName}' for Element {request.ElementId}.", LogLevel.Info);
            }
            catch (Exception ex)
            {
                _logger.LogError($"[ContextHandler] UpdateElementParameter failed: {ex.Message}");
                response.IsSuccess = false;
                response.ErrorMessage = ex.Message;
            }

            return response;
        }

        public async Task<BatchUpdateElementParametersResponse> BatchUpdateElementParameters(BatchUpdateElementParametersRequest request)
        {
            _logger.Log($"[ContextHandler] Entering BatchUpdateElementParameters. Processing {request.Updates.Count} updates.", LogLevel.Debug);
            var response = new BatchUpdateElementParametersResponse { IsSuccess = false };

            if (_uiApp == null)
            {
                response.ErrorMessage = "Revit UI Application is not available.";
                return response;
            }

            try
            {
                await CoreScript.Engine.Runtime.CoreScriptExecutionDispatcher.Instance.ExecuteInUIContext(() =>
                {
                    var uidoc = _uiApp.ActiveUIDocument;
                    if (uidoc == null) throw new Exception("No active document.");

                    var doc = uidoc.Document;

                    using (Transaction t = new Transaction(doc, "Paracore: Batch Parameter Update"))
                    {
                        t.Start();
                        int processedCount = 0;

                        foreach (var update in request.Updates)
                        {
                            var element = doc.GetElement(new ElementId(update.ElementId));
                            if (element == null) throw new Exception($"Element {update.ElementId} not found.");

                            Parameter? targetParam = element.LookupParameter(update.ParameterName);

                            if (targetParam == null)
                            {
                                foreach (Parameter p in element.Parameters)
                                {
                                    if (p.Definition.Name.Equals(update.ParameterName, StringComparison.OrdinalIgnoreCase))
                                    {
                                        targetParam = p;
                                        break;
                                    }
                                }
                            }

                            if (targetParam == null) throw new Exception($"Parameter '{update.ParameterName}' not found on Element {update.ElementId}.");
                            if (targetParam.IsReadOnly) throw new Exception($"Parameter '{update.ParameterName}' on Element {update.ElementId} is read-only.");

                            bool setSuccess = false;

                            switch (targetParam.StorageType)
                            {
                                case StorageType.String:
                                    setSuccess = targetParam.Set(update.NewValueString ?? string.Empty);
                                    break;
                                case StorageType.Integer:
                                    if (int.TryParse(update.NewValueString, out int intVal))
                                        setSuccess = targetParam.Set(intVal);
                                    else
                                        throw new Exception($"Cannot parse '{update.NewValueString}' as Integer for Parameter '{update.ParameterName}' on Element {update.ElementId}.");
                                    break;
                                case StorageType.Double:
                                    if (double.TryParse(update.NewValueString, out double doubleVal))
                                        setSuccess = targetParam.Set(doubleVal);
                                    else
                                        throw new Exception($"Cannot parse '{update.NewValueString}' as Double for Parameter '{update.ParameterName}' on Element {update.ElementId}.");
                                    break;
                                case StorageType.ElementId:
                                    if (long.TryParse(update.NewValueString, out long idVal))
                                        setSuccess = targetParam.Set(new ElementId(idVal));
                                    else
                                        throw new Exception($"Cannot parse '{update.NewValueString}' as ElementId for Parameter '{update.ParameterName}' on Element {update.ElementId}.");
                                    break;
                                default:
                                    throw new Exception($"Unsupported StorageType {targetParam.StorageType} for Parameter '{update.ParameterName}' on Element {update.ElementId}.");
                            }

                            if (!setSuccess)
                            {
                                throw new Exception($"Failed to set Parameter '{update.ParameterName}' on Element {update.ElementId}. Value might be out of range.");
                            }

                            processedCount++;
                        }

                        t.Commit();
                        response.Count = processedCount;
                        response.IsSuccess = true;
                        _logger.Log($"[ContextHandler] Atomic batch update successful. Total updates: {processedCount}.", LogLevel.Info);
                    }
                    return true;
                });
            }
            catch (Exception ex)
            {
                _logger.LogError($"[ContextHandler] BatchUpdateElementParameters failed: {ex.Message}");
                response.IsSuccess = false;
                response.ErrorMessage = ex.Message;
            }

            return response;
        }
    }
}
