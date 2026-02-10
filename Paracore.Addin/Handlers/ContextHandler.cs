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

            _logger.Log($"[ContextHandler] Revit Status: Open={{revitOpen}}, Version={{revitVersion}}, DocOpen={{documentOpen}}, DocTitle='{{documentTitle}}', DocType={{documentType}}.", LogLevel.Debug);
            return status;
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
    }
}
