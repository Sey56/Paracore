"""Governed Python/IFC execution for the Paracore desktop (v5 G3 Path A).

C# gallery scripts and the C# REPL still go through grpc_client into Revit. This module is
the parallel Python path. IfcOpenShell does the IFC work; this module supplies the part
Paracore owns: dry-run, explicit confirmation, derived-output discipline, element identity
and an audit record. The desktop REPL remains unrestricted for the user, as with C#.
"""

import contextlib
import importlib.util
import io
import json
import os
import traceback
from datetime import datetime, timezone
from typing import Any, Dict, Optional


_PY_SESSIONS: Dict[str, Dict[str, Any]] = {}
_MODULE_COUNTER = 0


def _require_ifcopenshell():
    try:
        import ifcopenshell
        return ifcopenshell
    except ImportError as exc:
        raise RuntimeError(
            "IfcOpenShell is not installed in rap-server. Run `uv sync` in rap-server/server."
        ) from exc


def load_python_manifest(tool_dir: str) -> Optional[Dict[str, Any]]:
    """Return the normalized tool.json manifest for a Python tool, or None."""
    manifest_path = os.path.join(tool_dir, "tool.json")
    if not os.path.isfile(manifest_path):
        return None
    with open(manifest_path, "r", encoding="utf-8-sig") as handle:
        data = json.load(handle)
    if data.get("language") != "python":
        return None

    root = os.path.normpath(os.path.abspath(tool_dir))
    entry = data.get("entry") or "Scripts/main.py"
    entry_path = os.path.normpath(os.path.abspath(os.path.join(root, entry)))
    if os.path.commonpath([root, entry_path]) != root:
        raise ValueError("tool.json entry must stay inside the tool folder")
    if not os.path.isfile(entry_path):
        raise FileNotFoundError(f"Python tool entry not found: {entry_path}")

    data["entry_path"] = entry_path
    data["params"] = list(data.get("params") or [])
    return data


def _coerce(value: Any, param: Dict[str, Any]) -> Any:
    kind = str(param.get("type") or "string").lower()
    if kind in ("number", "integer", "int"):
        try:
            return int(value) if kind in ("integer", "int") else float(value)
        except (TypeError, ValueError):
            return value
    if kind == "boolean":
        if isinstance(value, str):
            return value.strip().lower() in ("true", "1", "yes", "on")
        return bool(value)
    if kind == "string":
        return "" if value is None else str(value)
    return value


def normalize_parameters(parameters: Any, manifest_params: list) -> Dict[str, Any]:
    """Map the desktop's rich parameter array onto the manifest's typed Params."""
    supplied: Dict[str, Any] = {}
    if isinstance(parameters, str):
        try:
            parameters = json.loads(parameters)
        except (TypeError, ValueError):
            parameters = []
    if isinstance(parameters, dict):
        supplied = dict(parameters)
    elif isinstance(parameters, list):
        for item in parameters:
            if not isinstance(item, dict) or not item.get("name"):
                continue
            value = item.get("value")
            if value is None:
                value = item.get("defaultValue")
            if value is None:
                raw = item.get("defaultValueJson", "null")
                try:
                    value = json.loads(raw)
                except (TypeError, ValueError):
                    value = raw
            supplied[item["name"]] = value

    result: Dict[str, Any] = {}
    for param in manifest_params:
        name = param.get("name")
        if not name:
            continue
        raw_default = param.get("defaultValueJson", "null")
        try:
            default = json.loads(raw_default)
        except (TypeError, ValueError):
            default = raw_default
        result[name] = _coerce(supplied.get(name, default), param)
    return result


class IFCContext:
    """The object handed to a Python gallery script's run(ctx) function."""

    def __init__(self, tool_dir: str, manifest: Dict[str, Any], params: Dict[str, Any]):
        self.tool_dir = os.path.normpath(os.path.abspath(tool_dir))
        self.manifest = manifest
        self.params = params
        self.lines: list = []
        self.structured: Dict[str, Any] = {}
        self.changes: list = []
        self.derived_path: Optional[str] = None

        self.dry_run = bool(params.get("DryRun", True))
        self.confirmed = str(params.get("Confirm", "")).strip().upper() == "APPLY"

        source = params.get("InputIfc") or params.get("SourceIfc") or params.get("IfcPath")
        if not source:
            raise ValueError("A Python IFC tool needs an InputIfc parameter")
        self.source_path = self._resolve(str(source))
        if not os.path.isfile(self.source_path):
            raise FileNotFoundError(f"Input IFC not found: {self.source_path}")

        self.audit: Dict[str, Any] = {
            "tool": manifest.get("name") or os.path.basename(self.tool_dir),
            "language": "python",
            "started_utc": datetime.now(timezone.utc).isoformat(),
            "source_ifc": self.source_path,
            "derived_ifc": None,
            "dry_run": self.dry_run,
            "confirmed": self.confirmed,
            "changed_guids": [],
        }

    def _resolve(self, path: str) -> str:
        if os.path.isabs(path):
            return os.path.normpath(path)
        return os.path.normpath(os.path.abspath(os.path.join(self.tool_dir, path)))

    def print(self, *parts: Any) -> None:
        self.lines.append(" ".join(str(part) for part in parts))

    def emit(self, key: str, value: Any) -> None:
        self.structured[key] = value

    def open_ifc(self, path: Optional[str] = None):
        ifcopenshell = _require_ifcopenshell()
        return ifcopenshell.open(self._resolve(str(path or self.source_path)))

    def record_change(self, guid: str, prop: str, old_value: Any, new_value: Any) -> None:
        self.changes.append({
            "GlobalId": str(guid),
            "property": prop,
            "old": old_value,
            "new": new_value,
        })

    def write_derived(self, model, output_path: str) -> Optional[str]:
        """Write ONLY to a derived file, and only after explicit confirmation."""
        target = self._resolve(str(output_path))
        source_cmp = os.path.normcase(os.path.abspath(self.source_path))
        target_cmp = os.path.normcase(os.path.abspath(target))
        if target_cmp == source_cmp:
            raise ValueError("Derived IFC must not overwrite the source file")

        if self.dry_run:
            self.print(f"[dry-run] would write derived IFC: {target}")
            return None
        if not self.confirmed:
            raise PermissionError(
                "Write refused: set Confirm to APPLY after reviewing the dry-run report"
            )

        parent = os.path.dirname(target)
        if parent:
            os.makedirs(parent, exist_ok=True)
        model.write(target)
        self.derived_path = target
        self.audit["derived_ifc"] = target
        return target

    def diff(self, old_path: Optional[str] = None, new_path: Optional[str] = None) -> Dict[str, Any]:
        """Compare two IFC files by GlobalId. Mirrors the Revit dry-run change report."""
        new = new_path or self.derived_path
        if not new or not os.path.isfile(new):
            return {"skipped": "no derived file (dry-run or not yet written)"}
        try:
            from ifcdiff import IfcDiff
        except ImportError as exc:
            raise RuntimeError("ifcdiff is not installed in rap-server") from exc

        old_model = self.open_ifc(old_path or self.source_path)
        new_model = self.open_ifc(new)
        diff = IfcDiff(old_model, new_model, relationships=["property"])
        diff.diff()
        register = diff.change_register
        if hasattr(register, "keys"):
            summary: Dict[str, Any] = {}
            for key, value in register.items():
                summary[str(key)] = len(value) if value is not None else 0
            changed = register.get("changed") or {}
            guids = [str(guid) for guid in list(changed)]
            if not guids:
                guids = [
                    str(key) for key in register
                    if str(key) not in ("added", "deleted", "changed")
                ]
            summary["changed_guids"] = guids[:50]
            return summary
        return {"raw": str(register)[:2000]}


def _response_from_context(ctx: IFCContext, diff: Dict[str, Any]) -> Dict[str, Any]:
    ctx.audit["changed_guids"] = [change["GlobalId"] for change in ctx.changes]
    ctx.audit["finished_utc"] = datetime.now(timezone.utc).isoformat()
    structured = dict(ctx.structured)
    structured.update({
        "language": "python",
        "source_ifc": ctx.source_path,
        "derived_ifc": ctx.derived_path,
        "would_modify": len(ctx.changes),
        "changes": ctx.changes,
        "ifcdiff": diff,
    })
    return {
        "is_success": True,
        "output": "\n".join(ctx.lines),
        "structured_output": structured,
        "audit": ctx.audit,
        "error_message": None,
        "error_details": [],
    }


def _error_response(exc: BaseException) -> Dict[str, Any]:
    return {
        "is_success": False,
        "output": "",
        "structured_output": {"language": "python"},
        "error_message": str(exc),
        "error_details": traceback.format_exception(type(exc), exc, exc.__traceback__),
    }


async def run_python_tool(tool_path: str, parameters: Any) -> Dict[str, Any]:
    """Execute a Python gallery tool that exposes run(ctx)."""
    global _MODULE_COUNTER
    try:
        tool_dir = tool_path
        if os.path.isfile(tool_path) and os.path.basename(tool_path).lower() == "tool.json":
            tool_dir = os.path.dirname(tool_path)
        manifest = load_python_manifest(tool_dir)
        if manifest is None:
            raise ValueError(f"{tool_dir} has no Python tool.json manifest")

        params = normalize_parameters(parameters, manifest["params"])
        ctx = IFCContext(tool_dir, manifest, params)

        _MODULE_COUNTER += 1
        module_name = f"_paracore_ifc_tool_{_MODULE_COUNTER}"
        spec = importlib.util.spec_from_file_location(module_name, manifest["entry_path"])
        if spec is None or spec.loader is None:
            raise ImportError(f"Cannot load Python tool: {manifest['entry_path']}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        entry = getattr(module, "run", None)
        if not callable(entry):
            raise TypeError("Python gallery tools must define run(ctx)")

        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            entry(ctx)
        captured = buffer.getvalue().strip()
        if captured:
            ctx.lines.insert(0, captured)

        diff_buffer = io.StringIO()
        with contextlib.redirect_stdout(diff_buffer):
            diff = ctx.diff()
        diff_notes = diff_buffer.getvalue().strip()
        if diff_notes:
            ctx.lines.append(diff_notes)
        return _response_from_context(ctx, diff)
    except BaseException as exc:
        return _error_response(exc)


async def execute_python_repl(code: str, session_id: str = "global") -> Dict[str, Any]:
    """Unrestricted Python REPL for the desktop, matching the C# REPL's trust model."""
    namespace = _PY_SESSIONS.setdefault(session_id or "global", {})
    if not namespace:
        ifcopenshell = _require_ifcopenshell()
        namespace.update({
            "ifcopenshell": ifcopenshell,
            "json": json,
            "os": os,
            "open_ifc": lambda path: ifcopenshell.open(os.path.normpath(os.path.abspath(str(path)))),
        })
    buffer = io.StringIO()
    try:
        with contextlib.redirect_stdout(buffer):
            exec(compile(code, f"<paracore-python-repl:{session_id}>", "exec"), namespace)
        return {
            "is_success": True,
            "language": "python",
            "output": buffer.getvalue(),
            "structured_output": {"language": "python"},
            "error_message": None,
            "error_details": [],
        }
    except BaseException as exc:
        return {
            "is_success": False,
            "language": "python",
            "output": buffer.getvalue(),
            "structured_output": {"language": "python"},
            "error_message": str(exc),
            "error_details": traceback.format_exception(type(exc), exc, exc.__traceback__),
        }
