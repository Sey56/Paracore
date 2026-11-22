"""Backend bridge to the product-owned Dynamo export helpers in CoreScript.Engine.

The Python side intentionally contains no parser or compiler logic. It builds a tiny
gallery script that calls DynamoExportService, runs it through the existing Revit gRPC
path, and optionally writes the returned artifacts. The single implementation lives in
the engine and is shared with the gallery harness.
"""

import base64
import hashlib
import json
import logging
import os
from typing import Any, Dict, List, Optional

import grpc_client
from utils import resolve_script_path

MARKER = "__PARACORE_DYNAMO_EXPORT_JSON__"
# 4.9.0 ships exactly two export kinds: Methods and Graph.
# Standalone Params and DesignTables were retired; the engine's Params parser stays
# internal to Graph's script reader, not a user-facing export kind.
SUPPORTED_KINDS = ("Methods", "Graph")


def _find_scripts_folder(project_path: str) -> str:
    candidates = [os.path.join(project_path, "Scripts")]
    if not os.path.isdir(project_path):
        candidates.insert(0, os.path.dirname(project_path))
    for candidate in candidates:
        if os.path.isdir(candidate):
            return candidate
    raise FileNotFoundError(f"Scripts folder not found for {project_path}")


def _resolve_sources(project_path: str, export_kind: str) -> Dict[str, str]:
    scripts_dir = _find_scripts_folder(project_path)
    files = [
        os.path.join(scripts_dir, name)
        for name in os.listdir(scripts_dir)
        if name.lower().endswith(".cs")
    ]
    if not files:
        raise FileNotFoundError(f"No .cs files in {scripts_dir}")

    # Graph is derived from the selected script: it needs the tool source, not a Params file.
    if export_kind == "Graph":
        preferred = [f for f in files if os.path.splitext(os.path.basename(f))[0] ==
                     os.path.basename(project_path.rstrip("\\/"))]
        source = preferred[0] if preferred else files[0]
        return {"SourceParamsFile": "", "SourceScriptFile": source}

    preferred = [f for f in files if os.path.splitext(os.path.basename(f))[0] ==
                 os.path.basename(project_path.rstrip("\\/"))]

    source = preferred[0] if preferred else files[0]
    return {"SourceParamsFile": "", "SourceScriptFile": source}


def _cs_string(value: Optional[str]) -> str:
    return json.dumps(value or "", ensure_ascii=False)


def _build_driver_script(kind: str, sources: Dict[str, str], request: Dict[str, Any]) -> str:
    lines = [
        "var __exportRequest = new CoreScript.Engine.Core.DynamoExportService.Request(",
        f'    Mode: {_cs_string(kind)},',
        f'    SourceParamsFile: {_cs_string(sources.get("SourceParamsFile"))},',
        f'    SourceScriptFile: {_cs_string(sources.get("SourceScriptFile"))},',
        f'    ClassPrefix: {_cs_string(request.get("classPrefix"))},',
        f'    NodeClassName: {_cs_string(request.get("nodeClassName"))},',
        f'    AssemblyName: {_cs_string(request.get("assemblyName"))},',
        f'    PackageName: {_cs_string(request.get("packageName"))},',
        f'    OutputFolder: {_cs_string(request.get("outputFolder"))},',
        f'    DynamoVersion: {_cs_string(request.get("dynamoVersion") or "3.3")},',
        f'    GraphName: {_cs_string(request.get("graphName"))},',
        f'    WriteFiles: {"true" if request.get("dryRun") is False else "false"},',
        f'    OverwriteExisting: {"true" if request.get("overwriteExisting") else "false"});',
        "var __exportResult = CoreScript.Engine.Core.DynamoExportService.Build(__exportRequest);",
        f'Println("{MARKER}" + __exportResult.ToJson());',
    ]
    return "\n".join(lines)


def _parse_driver_response(response: Dict[str, Any]) -> Dict[str, Any]:
    if not response.get("is_success"):
        raise RuntimeError(response.get("error_message") or "Dynamo export script failed")

    output = response.get("output") or ""
    for line in output.splitlines():
        if MARKER in line:
            payload = line.split(MARKER, 1)[1].strip()
            return json.loads(payload)
    raise RuntimeError("Dynamo export helper returned no result envelope")


def export_dynamo(payload: Dict[str, Any]) -> Dict[str, Any]:
    kind = str(payload.get("exportKind") or "Methods").strip()
    if kind not in SUPPORTED_KINDS:
        raise ValueError(f"Unsupported exportKind '{kind}'. Supported: {', '.join(SUPPORTED_KINDS)}")

    script_path = str(payload.get("scriptPath") or "").strip()
    if not script_path:
        raise ValueError("scriptPath is required")

    project_path = resolve_script_path(script_path)
    sources = _resolve_sources(project_path, kind)
    driver = _build_driver_script(kind, sources, payload)

    response = grpc_client.execute_script(driver, "[]", source="Paracore")
    result = _parse_driver_response(response)

    if not result.get("Success"):
        return {
            "is_success": False,
            "export_kind": kind,
            "dry_run": bool(payload.get("dryRun", True)),
            "report": result.get("Report", []),
            "artifacts": [],
            "contract_sha256": "",
            "error_message": result.get("ErrorMessage") or "Dynamo export failed",
        }

    package_dir = result.get("PackageDir") or ""
    artifacts: List[Dict[str, Any]] = []
    for artifact in result.get("Artifacts", []):
        relative = artifact.get("RelativePath") or ""
        encoded = artifact.get("Bytes") or ""
        data = base64.b64decode(encoded)
        target = os.path.join(package_dir, relative) if package_dir else relative
        if payload.get("dryRun") is False:
            parent = os.path.dirname(target)
            if parent and not os.path.isdir(parent):
                os.makedirs(parent, exist_ok=True)
            try:
                with open(target, "wb") as handle:
                    handle.write(data)
            except PermissionError as exc:
                raise RuntimeError(
                    "Cannot replace '" + target + "': the file is locked by Revit. "
                    "Dynamo for Revit loads package DLLs inside Revit.exe, so closing the Dynamo "
                    "window is not enough. Close Revit completely and export again, or use a "
                    "different package name / output folder."
                ) from exc
        artifacts.append({
            "path": target,
            "sha256": hashlib.sha256(data).hexdigest(),
            "bytes": len(data),
        })

    return {
        "is_success": True,
        "export_kind": kind,
        "dry_run": bool(payload.get("dryRun", True)),
        "report": result.get("Report", []),
        "artifacts": artifacts,
        "contract_sha256": result.get("ContractSha256") or "",
        "error_message": "",
    }
