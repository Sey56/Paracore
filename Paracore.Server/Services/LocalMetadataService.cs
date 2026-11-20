using CoreScript;
using CoreScript.Engine.Core;
using CoreScript.Engine.Models;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace Paracore.Server.Services
{
    /// <summary>
    /// Script metadata answers that need NO Revit document.
    ///
    /// <para>
    /// This is the sidecar-side twin of the add-in's <c>MetadataHandler</c>. Every
    /// call is Roslyn syntax analysis over source text the Python server read from
    /// disk, plus <c>FileInfo</c> timestamps. The add-in's handler is unchanged;
    /// both use the SAME engine extractors, so a gallery built offline is byte-for-byte
    /// the metadata the add-in would have returned.
    /// </para>
    ///
    /// <para>
    /// The alternative -- relaying these to Revit -- made the whole gallery empty
    /// when Revit was closed (Python's <c>get_all_scripts</c> skips a project when
    /// its bulk-metadata result is missing). That is the restriction being lifted.
    /// </para>
    /// </summary>
    public sealed class LocalMetadataService
    {
        private readonly IMetadataExtractor _metadataExtractor;
        private readonly IParameterExtractor _parameterExtractor;
        private readonly IScriptCombiner _scriptCombiner;
        private readonly IScriptParser _scriptParser;
        private readonly IScriptCompiler _scriptCompiler;

        public LocalMetadataService(
            IMetadataExtractor metadataExtractor,
            IParameterExtractor parameterExtractor,
            IScriptCombiner scriptCombiner,
            IScriptParser scriptParser,
            IScriptCompiler scriptCompiler)
        {
            _metadataExtractor = metadataExtractor;
            _parameterExtractor = parameterExtractor;
            _scriptCombiner = scriptCombiner;
            _scriptParser = scriptParser;
            _scriptCompiler = scriptCompiler;
        }

        private static List<CoreScript.Engine.Models.ScriptFile> ToEngineFiles(IEnumerable<CoreScript.ScriptFile> files) =>
            files.Select(f => new CoreScript.Engine.Models.ScriptFile { FileName = f.FileName, Content = f.Content }).ToList();

        public GetScriptMetadataResponse GetScriptMetadata(GetScriptMetadataRequest request)
        {
            var response = new GetScriptMetadataResponse();
            try
            {
                var files = ToEngineFiles(request.ScriptFiles ?? Enumerable.Empty<CoreScript.ScriptFile>());
                if (files.Count == 0)
                {
                    response.Metadata = new CoreScript.ScriptMetadata
                    {
                        Name = "Uninitialized Tool",
                        Description = "No scripts found. Click Edit to scaffold."
                    };
                    return response;
                }

                string combined = _scriptCombiner.Combine(files);
                var topLevel = _scriptParser.IdentifyTopLevelScript(files);
                var meta = _metadataExtractor.ExtractMetadata(topLevel?.Content ?? combined);

                response.Metadata = new CoreScript.ScriptMetadata
                {
                    Name = meta.Name,
                    Description = meta.Description,
                    Author = meta.Author,
                    Website = meta.Website,
                    Categories = { meta.Categories },
                    LastRun = meta.LastRun,
                    Dependencies = { meta.Dependencies },
                    DocumentType = meta.DocumentType,
                    UsageExamples = { meta.UsageExamples },
                    IsWatchdog = meta.IsWatchdog,
                    DateCreated = "",
                    DateModified = ""
                };
            }
            catch (Exception ex)
            {
                response.ErrorMessage = $"Failed to extract metadata: {ex.Message}";
            }
            return response;
        }

        public GetScriptParametersResponse GetScriptParameters(GetScriptParametersRequest request)
        {
            var response = new GetScriptParametersResponse();
            try
            {
                var files = ToEngineFiles(request.ScriptFiles ?? Enumerable.Empty<CoreScript.ScriptFile>());
                if (files.Count == 0) return response;

                string combined = _scriptCombiner.Combine(files);
                foreach (var p in _parameterExtractor.ExtractParameters(combined))
                {
                    var proto = new CoreScript.ScriptParameter
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
                        SelectionType = p.SelectionType ?? "",
                        Filter = p.Filter ?? ""
                    };
                    proto.Options.AddRange(p.Options);
                    if (p.Min.HasValue) proto.Min = p.Min.Value;
                    if (p.Max.HasValue) proto.Max = p.Max.Value;
                    if (p.Step.HasValue) proto.Step = p.Step.Value;
                    response.Parameters.Add(proto);
                }
            }
            catch (Exception ex)
            {
                response.ErrorMessage = $"Failed to extract parameters: {ex.Message}";
            }
            return response;
        }

        public GetCombinedScriptResponse GetCombinedScript(GetCombinedScriptRequest request)
        {
            var response = new GetCombinedScriptResponse();
            try
            {
                var files = ToEngineFiles(request.ScriptFiles ?? Enumerable.Empty<CoreScript.ScriptFile>());
                response.CombinedScript = _scriptCombiner.Combine(files);
            }
            catch (Exception ex)
            {
                response.ErrorMessage = $"Failed to combine scripts: {ex.Message}";
            }
            return response;
        }

        public GetBulkMetadataResponse GetBulkMetadata(GetBulkMetadataRequest request)
        {
            var response = new GetBulkMetadataResponse();
            foreach (var project in request.Projects ?? Enumerable.Empty<CoreScript.ScriptProjectFiles>())
            {
                var proj = new ScriptMetadataResponse
                {
                    ProjectName = project.ProjectName,
                    AbsolutePath = project.AbsolutePath
                };

                try
                {
                    var files = ToEngineFiles(project.Files ?? Enumerable.Empty<CoreScript.ScriptFile>());
                    if (files.Count == 0)
                    {
                        proj.Metadata = new CoreScript.ScriptMetadata
                        {
                            Name = project.ProjectName,
                            Description = "No scripts found. Click Edit to scaffold.",
                            Categories = { "Uninitialized" }
                        };
                    }
                    else
                    {
                        string combined = _scriptCombiner.Combine(files);
                        var topLevel = _scriptParser.IdentifyTopLevelScript(files);
                        var meta = _metadataExtractor.ExtractMetadata(topLevel?.Content ?? combined);

                        proj.Metadata = new CoreScript.ScriptMetadata
                        {
                            Name = string.IsNullOrEmpty(meta.Name) ? project.ProjectName : meta.Name,
                            Description = meta.Description,
                            Author = meta.Author,
                            Website = meta.Website,
                            Categories = { meta.Categories },
                            LastRun = meta.LastRun,
                            Dependencies = { meta.Dependencies },
                            DocumentType = meta.DocumentType,
                            UsageExamples = { meta.UsageExamples },
                            IsWatchdog = meta.IsWatchdog,
                            DateCreated = FolderCreated(project.AbsolutePath),
                            DateModified = FolderModified(project.AbsolutePath)
                        };

                        foreach (var p in _parameterExtractor.ExtractParameters(combined))
                        {
                            var proto = new CoreScript.ScriptParameter
                            {
                                Name = p.Name,
                                Type = p.Type,
                                DefaultValueJson = p.DefaultValueJson,
                                Description = p.Description,
                                MultiSelect = p.MultiSelect,
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
                                SelectionType = p.SelectionType ?? "",
                                Filter = p.Filter ?? ""
                            };
                            proto.Options.AddRange(p.Options);
                            if (p.Min.HasValue) proto.Min = p.Min.Value;
                            if (p.Max.HasValue) proto.Max = p.Max.Value;
                            if (p.Step.HasValue) proto.Step = p.Step.Value;
                            proj.Parameters.Add(proto);
                        }
                    }
                }
                catch (Exception ex)
                {
                    proj.ErrorMessage = ex.Message;
                }
                response.ProjectMetadata.Add(proj);
            }
            return response;
        }

        public BuildScriptResponse BuildScript(BuildScriptRequest request)
        {
            var response = new BuildScriptResponse();
            try
            {
                response.CompiledAssembly = Google.Protobuf.ByteString.CopyFrom(
                    _scriptCompiler.CompileToBytes(request.ScriptContent));
                response.IsSuccess = true;
            }
            catch (Exception ex)
            {
                response.ErrorMessage = ex.Message;
            }
            return response;
        }

        private static string FolderCreated(string path)
        {
            try
            {
                string scripts = Path.Combine(path, "Scripts");
                if (Directory.Exists(scripts))
                {
                    var files = Directory.GetFiles(scripts, "*.*", SearchOption.TopDirectoryOnly);
                    if (files.Length > 0) return files.Select(f => new FileInfo(f).CreationTime).Min().ToString("o");
                }
                return Directory.Exists(path) ? new DirectoryInfo(path).CreationTime.ToString("o") : "";
            }
            catch { return ""; }
        }

        private static string FolderModified(string path)
        {
            try
            {
                string scripts = Path.Combine(path, "Scripts");
                if (Directory.Exists(scripts))
                {
                    var files = Directory.GetFiles(scripts, "*.*", SearchOption.TopDirectoryOnly);
                    if (files.Length > 0) return files.Select(f => new FileInfo(f).LastWriteTime).Max().ToString("o");
                }
                return Directory.Exists(path) ? new DirectoryInfo(path).LastWriteTime.ToString("o") : "";
            }
            catch { return ""; }
        }
    }
}
