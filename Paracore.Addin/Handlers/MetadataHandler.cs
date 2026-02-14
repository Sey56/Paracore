using CoreScript;
using CoreScript.Engine.Core;
using CoreScript.Engine.Logging;
using Paracore.Addin.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.IO;

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
                if (request.ScriptFiles == null || request.ScriptFiles.Count == 0)
                {
                    response.Metadata = new CoreScript.ScriptMetadata
                    {
                        Name = "Uninitialized Tool",
                        Description = "No scripts found. Click Edit to scaffold."
                    };
                    return response;
                }

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
                if (request.ScriptFiles == null || request.ScriptFiles.Count == 0)
                {
                    return response; // Return empty parameters list
                }

                var scriptFiles = request.ScriptFiles.Select(f => new CoreScript.Engine.Models.ScriptFile
                {
                    FileName = f.FileName,
                    Content = f.Content
                }).ToList();
                
                string combinedScript = _scriptCombiner.Combine(scriptFiles);
                var extractedParams = _parameterExtractor.ExtractParameters(combinedScript);

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

        public GetBulkMetadataResponse GetBulkMetadata(GetBulkMetadataRequest request)
        {
            var response = new GetBulkMetadataResponse();
            try
            {
                foreach (var project in request.Projects)
                {
                    var projResponse = new ScriptMetadataResponse
                    {
                        ProjectName = project.ProjectName,
                        AbsolutePath = project.AbsolutePath
                    };

                    try
                    {
                        if (project.Files == null || project.Files.Count == 0)
                        {
                            // V3 REFINED: Handle uninitialized Tool folders (no Scripts/ folder yet)
                            projResponse.Metadata = new CoreScript.ScriptMetadata
                            {
                                Name = project.ProjectName,
                                Description = "No scripts found. Click Edit to scaffold.",
                                Categories = { "Uninitialized" }
                            };
                        }
                        else
                        {
                            var scriptFiles = project.Files.Select(f => new CoreScript.Engine.Models.ScriptFile
                            {
                                FileName = f.FileName,
                                Content = f.Content
                            }).ToList();

                            string combined = _scriptCombiner.Combine(scriptFiles);
                            var metadata = _metadataExtractor.ExtractMetadata(combined);
                            var parameters = _parameterExtractor.ExtractParameters(combined);

                            projResponse.Metadata = new CoreScript.ScriptMetadata
                            {
                                Name = metadata.Name ?? project.ProjectName,
                                Description = metadata.Description,
                                Author = metadata.Author,
                                Website = metadata.Website,
                                Categories = { metadata.Categories },
                                LastRun = metadata.LastRun,
                                Dependencies = { metadata.Dependencies },
                                DocumentType = metadata.DocumentType,
                                UsageExamples = { metadata.UsageExamples }
                            };

                            foreach (var p in parameters)
                            {
                                projResponse.Parameters.Add(new CoreScript.ScriptParameter
                                {
                                    Name = p.Name,
                                    Type = p.Type,
                                    DefaultValueJson = p.DefaultValueJson,
                                    Description = p.Description,
                                    MultiSelect = p.MultiSelect,
                                    NumericType = p.NumericType ?? "",
                                    Unit = p.Unit ?? "",
                                    Group = p.Group ?? "",
                                    InputType = p.InputType ?? ""
                                });
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        projResponse.ErrorMessage = ex.Message;
                    }

                    response.ProjectMetadata.Add(projResponse);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError($"[MetadataHandler] Error in GetBulkMetadata: {ex.Message}");
            }
            return response;
        }

        /// <summary>
        /// V3 Refined Manifest: Scans a folder for Script Projects and extracts metadata in BULK.
        /// </summary>
        public GetScriptManifestResponse GetScriptManifest(GetScriptManifestRequest request)
        {
            var response = new GetScriptManifestResponse();
            try
            {
                string rootPath = request.ScriptPath;
                if (!Directory.Exists(rootPath))
                {
                    response.ErrorMessage = $"Root path does not exist: {rootPath}";
                    return response;
                }

                var scriptList = new List<object>();
                
                // Scan for project folders
                var projectDirs = Directory.GetDirectories(rootPath);
                foreach (var projectDir in projectDirs)
                {
                    string dirName = Path.GetFileName(projectDir);
                    if (dirName.StartsWith(".") || dirName == "bin" || dirName == "obj") continue;

                    string scriptsPath = Path.Combine(projectDir, "Scripts");
                    if (!Directory.Exists(scriptsPath)) continue;

                    var csFiles = Directory.GetFiles(scriptsPath, "*.cs");
                    if (csFiles.Length == 0) continue;

                    try
                    {
                        var scriptFiles = csFiles.Select(f => new CoreScript.Engine.Models.ScriptFile
                        {
                            FileName = Path.GetFileName(f),
                            Content = File.ReadAllText(f)
                        }).ToList();

                        string combined = _scriptCombiner.Combine(scriptFiles);
                        var metadata = _metadataExtractor.ExtractMetadata(combined);
                        var parameters = _parameterExtractor.ExtractParameters(combined);

                        var projectInfo = new
                        {
                            name = dirName,
                            type = "folder-project",
                            absolutePath = projectDir.Replace('\\', '/'),
                            metadata = new
                            {
                                displayName = metadata.Name ?? dirName,
                                description = metadata.Description,
                                author = metadata.Author,
                                website = metadata.Website,
                                categories = metadata.Categories,
                                lastRun = metadata.LastRun,
                                dependencies = metadata.Dependencies,
                                document_type = metadata.DocumentType,
                                usage_examples = metadata.UsageExamples,
                                dateCreated = DateTime.FromFileTime(new DirectoryInfo(projectDir).CreationTime.ToFileTime()).ToString("o"),
                                dateModified = DateTime.FromFileTime(new DirectoryInfo(projectDir).LastWriteTime.ToFileTime()).ToString("o")
                            },
                            parameters = parameters.Select(p => new {
                                name = p.Name,
                                type = p.Type,
                                defaultValue = p.DefaultValueJson,
                                description = p.Description,
                                inputType = p.InputType,
                                group = p.Group,
                                options = p.Options
                            }).ToList()
                        };

                        scriptList.Add(projectInfo);
                    }
                    catch (Exception ex)
                    {
                        _logger.Log($"[MetadataHandler] Skipping project {dirName} due to error: {ex.Message}", LogLevel.Warning);
                    }
                }

                response.ManifestJson = JsonSerializer.Serialize(scriptList);
            }
            catch (Exception ex)
            {
                _logger.LogError($"[MetadataHandler] Error in GetScriptManifest: {ex.Message}");
                response.ErrorMessage = $"Failed to generate manifest: {ex.Message}";
            }
            return response;
        }
    }
}
