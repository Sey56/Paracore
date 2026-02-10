using CoreScript;
using CoreScript.Engine.Core;
using CoreScript.Engine.Logging;
using Paracore.Addin.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;

namespace Paracore.Addin.Handlers
{
    public class MetadataHandler
    {
        private readonly ILogger _logger;
        private readonly IMetadataExtractor _metadataExtractor;
        private readonly IParameterExtractor _parameterExtractor;
        private readonly IScriptCombiner _scriptCombiner;
        private readonly IScriptParser _scriptParser;

        public MetadataHandler(ILogger logger, IMetadataExtractor metadataExtractor, IParameterExtractor parameterExtractor, IScriptCombiner scriptCombiner, IScriptParser scriptParser)
        {
            _logger = logger;
            _metadataExtractor = metadataExtractor;
            _parameterExtractor = parameterExtractor;
            _scriptCombiner = scriptCombiner;
            _scriptParser = scriptParser;
        }

        public GetScriptMetadataResponse GetScriptMetadata(GetScriptMetadataRequest request)
        {
            var response = new GetScriptMetadataResponse();
            try
            {
                var scriptFiles = request.ScriptFiles.Select(f => new CoreScript.Engine.Models.ScriptFile
                {
                    FileName = f.FileName,
                    Content = f.Content
                }).ToList();
                string combinedScript = _scriptCombiner.Combine(scriptFiles);
                var extractedMetadata = _metadataExtractor.ExtractMetadata(combinedScript);

                response.Metadata = new CoreScript.ScriptMetadata
                {
                    Name = extractedMetadata.Name,
                    Description = extractedMetadata.Description,
                    Author = extractedMetadata.Author,
                    Website = extractedMetadata.Website,
                    Categories = { extractedMetadata.Categories },
                    LastRun = extractedMetadata.LastRun,
                    Dependencies = { extractedMetadata.Dependencies },
                    DocumentType = extractedMetadata.DocumentType,
                    UsageExamples = { extractedMetadata.UsageExamples }
                };
            }
            catch (Exception ex)
            {
                _logger.LogError($"[MetadataHandler] Error in GetScriptMetadata: {ex.Message}");
                response.ErrorMessage = $"Failed to extract metadata: {ex.Message}";
            }
            return response;
        }

        public GetScriptParametersResponse GetScriptParameters(GetScriptParametersRequest request)
        {
            var response = new GetScriptParametersResponse();
            try
            {
                var scriptFiles = request.ScriptFiles.Select(f => new CoreScript.Engine.Models.ScriptFile
                {
                    FileName = f.FileName,
                    Content = f.Content
                }).ToList();
                var topLevelScript = _scriptParser.IdentifyTopLevelScript(scriptFiles);

                if (topLevelScript == null) return response;

                var extractedParams = _parameterExtractor.ExtractParameters(topLevelScript.Content);

                if (extractedParams.Count == 0 && scriptFiles.Count > 1)
                {
                   foreach (var file in scriptFiles.Where(f => f.FileName != topLevelScript.FileName))
                   {
                        var otherParams = _parameterExtractor.ExtractParameters(file.Content);
                        if (otherParams.Count > 0)
                        {
                            extractedParams = otherParams;
                             break; 
                        }
                   }
                }

                foreach (var p in extractedParams)
                {
                    var protoParam = new CoreScript.ScriptParameter
                    {
                        Name = p.Name,
                        Type = p.Type,
                        DefaultValueJson = p.DefaultValueJson,
                        Description = p.Description,
                        MultiSelect = p.MultiSelect,
                        VisibleWhen = p.VisibleWhen ?? "",
                        NumericType = p.NumericType ?? "",
                        IsRevitElement = p.IsRevitElement,
                        RevitElementType = p.RevitElementType ?? "",
                        RevitElementCategory = p.RevitElementCategory ?? "",
                        RequiresCompute = p.RequiresCompute,
                        Group = p.Group ?? "",
                        InputType = p.InputType ?? "",
                        Required = p.Required,
                        Suffix = p.Suffix ?? "",
                        Pattern = p.Pattern ?? "",
                        EnabledWhenParam = p.EnabledWhenParam ?? "",
                        EnabledWhenValue = p.EnabledWhenValue ?? "",
                        Unit = p.Unit ?? "",
                        SelectionType = p.SelectionType ?? ""
                    };
                    
                    protoParam.Options.AddRange(p.Options);
                    if (p.Min.HasValue) protoParam.Min = p.Min.Value;
                    if (p.Max.HasValue) protoParam.Max = p.Max.Value;
                    if (p.Step.HasValue) protoParam.Step = p.Step.Value;
                    
                    response.Parameters.Add(protoParam);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError($"[MetadataHandler] Error in GetScriptParameters: {ex.Message}");
                response.ErrorMessage = $"Failed to extract parameters: {ex.Message}";
            }
            return response;
        }

        public GetCombinedScriptResponse GetCombinedScript(GetCombinedScriptRequest request)
        {
            var response = new GetCombinedScriptResponse();
            try
            {
                var scriptFiles = request.ScriptFiles.Select(f => new CoreScript.Engine.Models.ScriptFile
                {
                    FileName = f.FileName,
                    Content = f.Content
                }).ToList();
                string combinedScript = _scriptCombiner.Combine(scriptFiles);
                response.CombinedScript = combinedScript;
            }
            catch (Exception ex)
            {
                _logger.LogError($"[MetadataHandler] Error in GetCombinedScript: {ex.Message}");
                response.ErrorMessage = $"Failed to combine scripts: {ex.Message}";
            }
            return response;
        }

        public GetScriptManifestResponse GetScriptManifest(GetScriptManifestRequest request)
        {
            var response = new GetScriptManifestResponse();
            try
            {
                string manifestPathRequest = request.ScriptPath;
                string rootPath = manifestPathRequest;
                List<string> targetPaths = new List<string>();

                if (manifestPathRequest.Contains("|"))
                {
                    var parts = manifestPathRequest.Split('|');
                    rootPath = parts[0];
                    if (parts.Length > 1 && !string.IsNullOrEmpty(parts[1]))
                    {
                        targetPaths = parts[1].Split(',').ToList();
                    }
                }
                else
                {
                    targetPaths.Add(rootPath);
                }

                if (!System.IO.Directory.Exists(rootPath))
                {
                    response.ErrorMessage = $"Root script path does not exist: {rootPath}";
                    return response;
                }

                var scriptInfoList = new List<InternalScriptInfo>();
                List<string> sourceFolders;
                if (targetPaths.Count == 1 && targetPaths[0] == rootPath)
                {
                    sourceFolders = System.IO.Directory.GetDirectories(rootPath)
                        .Where(d => {
                            string name = System.IO.Path.GetFileName(d);
                            return !name.StartsWith(".") && name != "bin" && name != "obj";
                        }).ToList();
                }
                else
                {
                    sourceFolders = targetPaths;
                }

                foreach (var sourcePath in sourceFolders)
                {
                    if (System.IO.Directory.Exists(sourcePath))
                    {
                        ScanSourceFolder(sourcePath, rootPath, scriptInfoList);
                    }
                }

                var dictList = scriptInfoList.Select(info => new
                {
                    name = info.Metadata.Name,
                    type = info.Metadata.ScriptType,
                    absolutePath = System.IO.Path.Combine(rootPath, info.Metadata.FilePath),
                    metadata = new
                    {
                        description = info.Metadata.Description,
                        displayName = info.Metadata.Name,
                        relativePath = info.Metadata.FilePath,
                        author = info.Metadata.Author,
                        categories = info.Metadata.Categories,
                        usage_examples = info.Metadata.UsageExamples,
                        dependencies = info.Metadata.Dependencies,
                        document_type = info.Metadata.DocumentType,
                        lastRun = info.Metadata.LastRun,
                        is_protected = info.Metadata.IsProtected,
                        is_compiled = info.Metadata.IsCompiled
                    },
                    parameters = info.Parameters.Select(p => new {
                        name = p.Name,
                        type = p.Type,
                        description = p.Description,
                        defaultValue = p.DefaultValueJson,
                        numericType = p.NumericType,
                        unit = p.Unit,
                        min = p.HasMin ? (double?)p.Min : null,
                        max = p.HasMax ? (double?)p.Max : null,
                        step = p.HasStep ? (double?)p.Step : null,
                        options = p.Options,
                        isRevitElement = p.IsRevitElement,
                        revitElementType = p.RevitElementType,
                        revitElementCategory = p.RevitElementCategory,
                        required = p.Required,
                        group = p.Group,
                        pattern = p.Pattern,
                        inputType = p.InputType,
                        suffix = p.Suffix,
                        enabledWhenParam = p.EnabledWhenParam,
                        enabledWhenValue = p.EnabledWhenValue,
                        selectionType = p.SelectionType,
                        multiSelect = p.MultiSelect
                    }).ToList()
                }).ToList();
                response.ManifestJson = JsonSerializer.Serialize(dictList);
            }
            catch (Exception ex)
            {
                _logger.LogError($"[MetadataHandler] Error in GetScriptManifest: {ex.Message}");
                response.ErrorMessage = $"Failed to generate manifest: {ex.Message}";
            }
            return response;
        }

        private void ScanSourceFolder(string sourcePath, string rootPath, List<InternalScriptInfo> scripts)
        {
            try
            {
                var csFiles = System.IO.Directory.GetFiles(sourcePath, "*.cs", System.IO.SearchOption.TopDirectoryOnly);
                foreach (var filePath in csFiles)
                {
                    if (System.IO.Path.GetFileName(filePath).StartsWith(".")) continue;
                    AddSingleFileScript(filePath, rootPath, scripts);
                }

                var subDirs = System.IO.Directory.GetDirectories(sourcePath);
                foreach (var dir in subDirs)
                {
                    string dirName = System.IO.Path.GetFileName(dir);
                    if (dirName.StartsWith(".") || dirName == "bin" || dirName == "obj") continue;

                    if (IsMultiFileScript(dir, out string metadataContent, out List<CoreScript.ScriptParameter> parameters))
                    {
                        AddMultiFileScript(dir, metadataContent, parameters, rootPath, scripts);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Log($"[MetadataHandler] Error scanning source folder {sourcePath}: {ex.Message}", LogLevel.Warning);
            }
        }

        private void AddSingleFileScript(string filePath, string rootPath, List<InternalScriptInfo> scripts)
        {
            try
            {
                string content = System.IO.File.ReadAllText(filePath);
                var metadata = _metadataExtractor.ExtractMetadata(content);
                var paramList = MapToProtoParameters(_parameterExtractor.ExtractParameters(content));

                if (string.IsNullOrEmpty(metadata.Name))
                    metadata.Name = System.IO.Path.GetFileNameWithoutExtension(filePath);
                string relativePath = System.IO.Path.GetRelativePath(rootPath, filePath);

                scripts.Add(new InternalScriptInfo
                {
                    Metadata = new CoreScript.ScriptMetadata
                    {
                        Name = metadata.Name,
                        FilePath = relativePath,
                        ScriptType = "single-file",
                        Description = metadata.Description,
                        Author = metadata.Author,
                        Website = metadata.Website,
                        Categories = { metadata.Categories },
                        LastRun = metadata.LastRun,
                        Dependencies = { metadata.Dependencies },
                        DocumentType = metadata.DocumentType,
                        UsageExamples = { metadata.UsageExamples }
                    },
                    Parameters = paramList
                });
            }
            catch (Exception ex)
            {
                _logger.Log($"[MetadataHandler] Failed to parse single script {filePath}: {ex.Message}", LogLevel.Warning);
            }
        }

        private void AddMultiFileScript(string dirPath, string metadataSourceContent, List<CoreScript.ScriptParameter> parameters, string rootPath, List<InternalScriptInfo> scripts)
        {
            try
            {
                var metadata = _metadataExtractor.ExtractMetadata(metadataSourceContent);

                if (string.IsNullOrEmpty(metadata.Name))
                    metadata.Name = System.IO.Path.GetFileName(dirPath);
                string relativePath = System.IO.Path.GetRelativePath(rootPath, dirPath);

                scripts.Add(new InternalScriptInfo
                {
                    Metadata = new CoreScript.ScriptMetadata
                    {
                        Name = metadata.Name,
                        FilePath = relativePath,
                        ScriptType = "multi-file",
                        Description = metadata.Description,
                        Author = metadata.Author,
                        Website = metadata.Website,
                        Categories = { metadata.Categories },
                        LastRun = metadata.LastRun,
                        Dependencies = { metadata.Dependencies },
                        DocumentType = metadata.DocumentType,
                        UsageExamples = { metadata.UsageExamples }
                    },
                    Parameters = parameters
                });
            }
            catch (Exception ex)
            {
                _logger.Log($"[MetadataHandler] Failed to parse multi-file script {dirPath}: {ex.Message}", LogLevel.Warning);
            }
        }

        private bool IsMultiFileScript(string dirPath, out string metadataSourceContent, out List<CoreScript.ScriptParameter> parameters)
        {
            metadataSourceContent = "";
            parameters = new List<CoreScript.ScriptParameter>();

            var files = System.IO.Directory.GetFiles(dirPath, "*.cs", System.IO.SearchOption.TopDirectoryOnly);

            if (files.Length == 0) return false;
            
            var scriptFiles = files.Select(f => new CoreScript.Engine.Models.ScriptFile
            {
                FileName = System.IO.Path.GetFileName(f),
                Content = System.IO.File.ReadAllText(f)
            }).ToList();

            var topLevelScript = _scriptParser.IdentifyTopLevelScript(scriptFiles);

            if (topLevelScript != null)
            {
                metadataSourceContent = topLevelScript.Content;
                parameters = MapToProtoParameters(_parameterExtractor.ExtractParameters(topLevelScript.Content));
            }
            else
            {
                metadataSourceContent = _scriptCombiner.Combine(scriptFiles);
                parameters = MapToProtoParameters(_parameterExtractor.ExtractParameters(metadataSourceContent));
            }
            return true;
        }

        private List<CoreScript.ScriptParameter> MapToProtoParameters(List<CoreScript.Engine.Models.ScriptParameter> extractedParams)
        {
            var protoParams = new List<CoreScript.ScriptParameter>();
            foreach (var p in extractedParams)
            {
                var protoParam = new CoreScript.ScriptParameter
                {
                    Name = p.Name,
                    Type = p.Type,
                    DefaultValueJson = p.DefaultValueJson,
                    Description = p.Description,
                    MultiSelect = p.MultiSelect,
                    VisibleWhen = p.VisibleWhen ?? "",
                    NumericType = p.NumericType ?? "",
                    IsRevitElement = p.IsRevitElement,
                    RevitElementType = p.RevitElementType ?? "",
                    RevitElementCategory = p.RevitElementCategory ?? "",
                    RequiresCompute = p.RequiresCompute,
                    Group = p.Group ?? "",
                    InputType = p.InputType ?? "",
                    Required = p.Required,
                    Suffix = p.Suffix ?? "",
                    Pattern = p.Pattern ?? "",
                    EnabledWhenParam = p.EnabledWhenParam ?? "",
                    EnabledWhenValue = p.EnabledWhenValue ?? "",
                    Unit = p.Unit ?? "",
                    SelectionType = p.SelectionType ?? ""
                };
                
                protoParam.Options.AddRange(p.Options);
                if (p.Min.HasValue) protoParam.Min = p.Min.Value;
                if (p.Max.HasValue) protoParam.Max = p.Max.Value;
                if (p.Step.HasValue) protoParam.Step = p.Step.Value;
                
                protoParams.Add(protoParam);
            }
            return protoParams;
        }
    }
}
