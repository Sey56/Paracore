import logging
import os
import json
from contextlib import contextmanager
from typing import Optional

import corescript_pb2
import corescript_pb2_grpc
import grpc
from utils import format_grpc_error

# ── Constants ──────────────────────────────────────────────────────────────────
GRPC_UNAVAILABLE_MSG = "Revit is closed or Paracore server is unavailable."
_GRPC_RECONNECT_OPTIONS = [
    ('grpc.initial_reconnect_backoff_ms', 500),
    ('grpc.max_reconnect_backoff_ms', 2000),
    ('grpc.min_reconnect_backoff_ms', 500),
]

# Global channel variable
_channel = None

class RevitConfig:
    def __init__(self):
        self.revit_install_path: Optional[str] = None
        self.addin_server_path: Optional[str] = None

_revit_config = RevitConfig()

def get_revit_config():
    return _revit_config

def init_channel():
    """Initializes the global gRPC channel with aggressive reconnect limits."""
    global _channel
    if _channel is None:
        grpc_server_address = os.environ.get('GRPC_SERVER_ADDRESS', 'localhost:50051')
        logging.debug(f"Initializing gRPC channel to {grpc_server_address}")
        _channel = grpc.insecure_channel(grpc_server_address, options=_GRPC_RECONNECT_OPTIONS)

def close_channel():
    """Closes the global gRPC channel."""
    global _channel
    if _channel:
        logging.debug("Closing gRPC channel")
        _channel.close()
        _channel = None

@contextmanager
def get_corescript_runner_stub():
    """Provides a gRPC stub using the global singleton channel."""
    global _channel
    # Fallback if channel wasn't initialized (e.g. running outside main app)
    local_channel = None

    try:
        if _channel is None:
            logging.debug("Global gRPC channel not initialized. Creating temporary channel.")
            grpc_server_address = os.environ.get('GRPC_SERVER_ADDRESS', 'localhost:50051')
            local_channel = grpc.insecure_channel(grpc_server_address, options=_GRPC_RECONNECT_OPTIONS)
            stub = corescript_pb2_grpc.CoreScriptRunnerStub(local_channel)
            yield stub
        else:
            stub = corescript_pb2_grpc.CoreScriptRunnerStub(_channel)
            yield stub
    finally:
        if local_channel:
            local_channel.close()

def register_watchdog_source(path: str, parameters_json: Optional[str] = None):
    """
    Calls the gRPC service to scan a folder and arm all watchdogs found.
    """
    try:
        with get_corescript_runner_stub() as stub:
            req_params = {'path': path}
            if parameters_json is not None:
                req_params['parameters_json'] = parameters_json.encode('utf-8')
            
            request = corescript_pb2.RegisterWatchdogSourceRequest(**req_params)
            response = stub.RegisterWatchdogSource(request)
            return {
                "is_success": response.is_success,
                "error_message": response.error_message,
                "watchdogs_registered": response.watchdogs_registered,
                "load_details": list(response.load_details)
            }
    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.UNAVAILABLE:
            return {
                "is_success": False,
                "error_message": GRPC_UNAVAILABLE_MSG,
                "watchdogs_registered": 0,
                "load_details": []
            }
        logging.error(format_grpc_error(e))
        return {
            "is_success": False,
            "error_message": f"gRPC Error: {e.details()}",
            "watchdogs_registered": 0,
            "load_details": []
        }
    except Exception as e:
        logging.error(f"Error calling RegisterWatchdogSource: {e}")
        return {
            "is_success": False,
            "error_message": str(e),
            "watchdogs_registered": 0,
            "load_details": []
        }

def get_status():
    # logging.info("Attempting to get gRPC server status.")
    try:
        with get_corescript_runner_stub() as stub:
            response = stub.GetStatus(corescript_pb2.GetStatusRequest())
        
        # Cache paths for scaffolding
        if response.paracore_connected:
            _revit_config.revit_install_path = response.revit_install_path
            _revit_config.addin_server_path = response.addin_server_path
            
        return response
    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.UNAVAILABLE:
            # Silently return a disconnected response instead of raising/logging
            close_channel()
            return corescript_pb2.GetStatusResponse(paracore_connected=False, revit_open=False)
        logging.error(format_grpc_error(e))
        raise # Re-raise other gRPC errors
    except Exception as e:
        logging.error(f"An unexpected error occurred during gRPC GetStatus call: {e}")
        raise # Re-raise the unexpected error

def get_model_categories():
    """
    Calls the gRPC service to fetch all model categories on demand.
    """
    try:
        with get_corescript_runner_stub() as stub:
            response = stub.GetModelCategories(corescript_pb2.GetModelCategoriesRequest())
            
            all_cats = []
            for cat in response.categories:
                all_cats.append({"id": cat.id, "label": cat.label})
            
            return {
                "categories": all_cats,
                "error_message": response.error_message
            }
    except Exception as e:
        if isinstance(e, grpc.RpcError) and e.code() == grpc.StatusCode.UNAVAILABLE:
            return {"categories": [], "error_message": GRPC_UNAVAILABLE_MSG}
        logging.error(f"Error calling GetModelCategories gRPC: {e}")
        return {"categories": [], "error_message": str(e)}

def get_watchdog_statuses():
    """
    Calls the gRPC service to fetch all active background watcher statuses.
    """
    try:
        with get_corescript_runner_stub() as stub:
            response = stub.GetWatchdogStatus(corescript_pb2.GetWatchdogStatusRequest())
            
            watchdogs = []
            for w in response.watchdogs:
                watchdogs.append({
                    "script_path": w.script_path,
                    "script_name": w.script_name,
                    "summary": w.summary,
                    "status": w.status,
                    "details_json": w.details_json,
                    "timestamp": w.timestamp,
                    "parameters_json": getattr(w, "parameters_json", "")
                })

            failed_watchdogs = []
            for f in response.failed_watchdogs:
                failed_watchdogs.append({
                    "script_path": f.script_path,
                    "script_name": f.script_name,
                    "error_message": f.error_message,
                    "timestamp": f.timestamp
                })
            
            return {
                "watchdogs": watchdogs,
                "failed_watchdogs": failed_watchdogs
            }
    except grpc.RpcError as e:
        # Handle connection errors gracefully when Revit is closed
        if e.code() == grpc.StatusCode.UNAVAILABLE:
            # We don't log the full stack trace for a simple unavailable state (usually just Revit closed)
            return {"watchdogs": [], "failed_watchdogs": [], "error_message": GRPC_UNAVAILABLE_MSG}
        
        logging.error(f"gRPC Error in GetWatchdogStatus: {e.details()}")
        return {"watchdogs": [], "failed_watchdogs": [], "error_message": str(e)}
    except Exception as e:
        logging.error(f"Error calling GetWatchdogStatus gRPC: {e}")
        return {"watchdogs": [], "failed_watchdogs": [], "error_message": str(e)}

def _build_parameter_dict(p, parse_value: bool = False) -> dict:
    """Build a parameter dict from a protobuf Parameter message.

    Extracted to deduplicate the ~25-field construction that appears in
    both get_script_parameters() and get_bulk_metadata().
    """
    val = p.default_value_json
    if parse_value:
        try:
            val = json.loads(val)
        except (json.JSONDecodeError, TypeError):
            pass

    result = {
        "name": p.name,
        "type": p.type,
        "description": p.description,
        "options": list(p.options),
        "multiSelect": p.multi_select,
        "visibleWhen": p.visible_when,
        "numericType": p.numeric_type,
        "min": p.min if p.HasField('min') else None,
        "max": p.max if p.HasField('max') else None,
        "step": p.step if p.HasField('step') else None,
        "isRevitElement": p.is_revit_element,
        "revitElementType": p.revit_element_type,
        "revitElementCategory": p.revit_element_category,
        "requiresCompute": p.requires_compute,
        "group": p.group,
        "inputType": p.input_type,
        "required": p.required,
        "suffix": p.suffix,
        "pattern": p.pattern,
        "enabledWhenParam": p.enabled_when_param,
        "enabledWhenValue": p.enabled_when_value,
        "unit": p.unit,
        "selectionType": p.selection_type,
    }
    if parse_value:
        result["defaultValue"] = val
        result["value"] = val
    else:
        result["defaultValueJson"] = val
    return result


def execute_script(script_content, parameters_json, compiled_assembly=None, source="Paracore"):
    # logging.info("Attempting to execute script via gRPC.")
    with get_corescript_runner_stub() as stub:
        request = corescript_pb2.ExecuteScriptRequest(
            script_content=script_content.encode('utf-8') if script_content else b"",
            parameters_json=parameters_json.encode('utf-8'),
            compiled_assembly=compiled_assembly if compiled_assembly else b"",
            source=source
        )
        try:
            response = stub.ExecuteScript(request)
            # logging.info("gRPC ExecuteScript call successful.")
            # Process and return the successful response
            structured_output_data = [{"type": item.type, "data": item.data, "title": item.title} for item in response.structured_output]
            pipeline_diags = list(getattr(response, 'pipeline_diagnostics', []))

            return {
                "is_success": response.is_success,
                "output": response.output,
                "error_message": response.error_message,
                "error_details": list(response.error_details),
                "structured_output": structured_output_data,
                "internal_data": response.internal_data,
                "pipeline_diagnostics": pipeline_diags,
                "user_rejected": getattr(response, 'user_rejected', False),
            }
        except grpc.RpcError as e:
            if e.code() == grpc.StatusCode.UNAVAILABLE:
                return {
                    "is_success": False,
                    "output": "",
                    "error_message": GRPC_UNAVAILABLE_MSG,
                    "error_details": [],
                    "structured_output": [],
                    "internal_data": "",
                    "user_rejected": False,
                }
            logging.error(format_grpc_error(e))
            raise # Re-raise the gRPC error

def get_script_metadata(script_files):
    with get_corescript_runner_stub() as stub:
        grpc_script_files = [corescript_pb2.ScriptFile(file_name=f['file_name'], content=f['content']) for f in script_files]
        request = corescript_pb2.GetScriptMetadataRequest(script_files=grpc_script_files)
        response = stub.GetScriptMetadata(request)

    # Manually construct the dictionary to ensure empty fields are included (Proto3 omits them by default in MessageToDict)
    # and to avoid version-specific keyword arguments errors.
    m = response.metadata
    metadata_dict = {
        "name": m.name,
        "file_path": m.file_path,
        "description": m.description,
        "author": m.author,
        "categories": list(m.categories),
        "dependencies": list(m.dependencies),
        "document_type": m.document_type,
        "usage_examples": list(m.usage_examples),
        "website": m.website,
        "last_run": m.last_run,
        "is_protected": m.is_protected,
        "is_compiled": m.is_compiled,
        "is_watchdog": m.is_watchdog
    }

    return {
        "metadata": metadata_dict,
        "error_message": response.error_message
    }

def get_script_parameters(script_files):
    with get_corescript_runner_stub() as stub:
        grpc_script_files = [corescript_pb2.ScriptFile(file_name=f['file_name'], content=f['content']) for f in script_files]
        request = corescript_pb2.GetScriptParametersRequest(script_files=grpc_script_files)
        response = stub.GetScriptParameters(request)

    params_to_return = [_build_parameter_dict(p) for p in response.parameters]

    return {
        "parameters": params_to_return,
        "error_message": response.error_message
    }

def get_combined_script(script_files):
    with get_corescript_runner_stub() as stub:
        grpc_script_files = [corescript_pb2.ScriptFile(file_name=f['file_name'], content=f['content']) for f in script_files]
        request = corescript_pb2.GetCombinedScriptRequest(script_files=grpc_script_files)
        response = stub.GetCombinedScript(request)

    return {
        "combined_script": response.combined_script,
        "error_message": response.error_message
    }

def get_bulk_metadata(projects_data: list):
    """
    Fetches metadata for multiple project folders in a single gRPC call.
    projects_data: list of {'project_name': str, 'absolute_path': str, 'files': list of ScriptFiles}
    """
    with get_corescript_runner_stub() as stub:
        grpc_projects = []
        for p in projects_data:
            grpc_files = [corescript_pb2.ScriptFile(file_name=f['file_name'], content=f['content']) for f in p['files']]
            grpc_projects.append(corescript_pb2.ScriptProjectFiles(
                project_name=p['project_name'],
                absolute_path=p['absolute_path'],
                files=grpc_files
            ))
        
        request = corescript_pb2.GetBulkMetadataRequest(projects=grpc_projects)
        response = stub.GetBulkMetadata(request)

    results = []
    for pm in response.project_metadata:
        m = pm.metadata
        metadata_dict = {
            "displayName": m.name,
            "description": m.description,
            "author": m.author,
            "categories": list(m.categories),
            "dependencies": list(m.dependencies),
            "document_type": m.document_type,
            "usage_examples": list(m.usage_examples),
            "website": m.website,
            "lastRun": m.last_run,
            "dateCreated": m.date_created,
            "dateModified": m.date_modified,
            "isProtected": m.is_protected,
            "isCompiled": m.is_compiled,
            "isWatchdog": m.is_watchdog
        }
        
        params_list = [_build_parameter_dict(p, parse_value=True) for p in pm.parameters]

        results.append({
            "project_name": pm.project_name,
            "absolute_path": pm.absolute_path,
            "metadata": metadata_dict,
            "parameters": params_list,
            "error_message": pm.error_message
        })

    return results

def create_and_open_workspace(tool_path: str):
    """
    Tells the Addin to scaffold the Tool folder and open it in VS Code.
    """
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.CreateWorkspaceRequest(
                script_path=tool_path
            )
            response = stub.CreateAndOpenWorkspace(request)
        return {
            "workspace_path": response.workspace_path,
            "error_message": response.error_message
        }
    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.UNAVAILABLE:
            return {"workspace_path": "", "error_message": GRPC_UNAVAILABLE_MSG}
        return {"workspace_path": "", "error_message": str(e)}
    except Exception as e:
        return {"workspace_path": "", "error_message": str(e)}

def stop_sync_session(script_path: str):
    """
    Calls the gRPC service to stop file watchers for a given script.
    """
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.StopSyncSessionRequest(script_path=script_path)
            response = stub.StopSyncSession(request)
            return {
                "is_success": response.is_success,
                "error_message": response.error_message
            }
    except Exception as e:
        logging.error(f"Error calling StopSyncSession gRPC: {e}")
        return {"is_success": False, "error_message": str(e)}


def get_context():
    """
    Calls the gRPC service to get the current Revit context (selection, view, etc.).
    """
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.GetContextRequest()
            response = stub.GetContext(request)

        return {
            "active_view_name": response.active_view_name,
            "active_view_type": response.active_view_type,
            "active_view_scale": response.active_view_scale,
            "active_view_detail_level": response.active_view_detail_level,
            "selection_count": response.selection_count,
            "selected_element_ids": list(response.selected_element_ids),
            "selected_elements": [
                {"id": item.id, "category": item.category}
                for item in response.selected_elements
            ],
            "levels": [
                {"id": l.id, "name": l.name, "elevation": l.elevation}
                for l in response.levels
            ],
            "project_info": {
                "name": response.project_info.name,
                "number": response.project_info.number,
                "title": response.project_info.title,
                "file_path": response.project_info.file_path,
                "is_workshared": response.project_info.is_workshared,
                "username": response.project_info.username
            } if response.HasField("project_info") else None
        }
    except Exception:
        logging.error("Error calling GetContext gRPC", exc_info=True)
        raise


def compute_parameter_options(script_content: str, parameter_name: str, parameters: dict = None):
    """
    Calls the gRPC service to execute the {parameter_name}_Options() function in Revit.
    """
    logging.info(f"Attempting to compute options for parameter '{parameter_name}' via gRPC.")
    try:
        parameters_json = json.dumps(parameters or {})
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.ComputeParameterOptionsRequest(
                script_content=script_content,
                parameter_name=parameter_name,
                parameters_json=parameters_json.encode('utf-8')
            )
            response = stub.ComputeParameterOptions(request)
            return {
                "options": list(response.options),
                "is_success": response.is_success,
                "error_message": response.error_message,
                "min": response.min if response.HasField('min') else None,
                "max": response.max if response.HasField('max') else None,
                "step": response.step if response.HasField('step') else None
            }
    except grpc.RpcError as e:
        logging.error(format_grpc_error(e))
        return {
            "options": [],
            "is_success": False,
            "error_message": f"gRPC error: {e.details()}"
        }
    except Exception as e:
        logging.error(f"An unexpected error occurred during gRPC ComputeParameterOptions call: {e}")
        return {
            "options": [],
            "is_success": False,
            "error_message": f"Unexpected error: {str(e)}"
        }

def select_elements(element_ids: list[int]):
        """
        Calls the gRPC service to set the selection in the active Revit document.
        """
        logging.info(f"Attempting to select {len(element_ids)} elements via gRPC.")
        try:
            with get_corescript_runner_stub() as stub:
                request = corescript_pb2.SelectElementsRequest(element_ids=element_ids)
                response = stub.SelectElements(request)
                return {
                    "is_success": response.is_success,
                    "error_message": response.error_message
                }
        except grpc.RpcError as e:
            logging.error(format_grpc_error(e))
            return {
                "is_success": False,
                "error_message": f"gRPC error: {e.details()}"
            }
        except Exception as e:
            logging.error(f"An unexpected error occurred during gRPC SelectElements call: {e}")
            return {
                "is_success": False,
                "error_message": f"Unexpected error: {str(e)}"
            }

def update_element_parameter(element_id: int, parameter_name: str, new_value_string: str, unit: Optional[str] = None):
    """
    Calls the gRPC service to update a parameter on a specific element.
    """
    logging.info(f"Attempting to update parameter '{parameter_name}' on element {element_id} via gRPC (Unit: {unit}).")
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.UpdateElementParameterRequest(
                element_id=element_id,
                parameter_name=parameter_name,
                new_value_string=new_value_string,
                unit=unit or ""
            )
            response = stub.UpdateElementParameter(request)
            return {
                "is_success": response.is_success,
                "error_message": response.error_message
            }
    except grpc.RpcError as e:
        logging.error(format_grpc_error(e))
        return {
            "is_success": False,
            "error_message": f"gRPC error: {e.details()}"
        }
    except Exception as e:
        logging.error(f"An unexpected error occurred during gRPC UpdateElementParameter call: {e}")
        return {
            "is_success": False,
            "error_message": f"Unexpected error: {str(e)}"
        }

def batch_update_element_parameters(updates: list):
    """
    Calls the gRPC service to update multiple parameters in a single transaction.
    `updates` is a list of dicts: [{'element_id': int, 'parameter_name': str, 'new_value_string': str}]
    """
    logging.info(f"Attempting to batch update {len(updates)} parameters via gRPC.")
    try:
        with get_corescript_runner_stub() as stub:
            proto_items = [
                corescript_pb2.ParameterUpdateItem(
                    element_id=int(u["element_id"]),
                    parameter_name=str(u["parameter_name"]),
                    new_value_string=str(u["new_value_string"]),
                    unit=str(u.get("unit") or "")
                ) for u in updates
            ]
            request = corescript_pb2.BatchUpdateElementParametersRequest(updates=proto_items)
            response = stub.BatchUpdateElementParameters(request)
            return {
                "is_success": response.is_success,
                "error_message": response.error_message,
                "count": response.count
            }
    except grpc.RpcError as e:
        logging.error(format_grpc_error(e))
        return {
            "is_success": False,
            "error_message": f"gRPC error: {e.details()}"
        }
    except Exception as e:
        logging.error(f"An unexpected error occurred during gRPC BatchUpdateElementParameters call: {e}")
        return {
            "is_success": False,
            "error_message": f"Unexpected error: {str(e)}"
        }

def pick_object(selection_type: str, category_filter: str = None):
    """
    Calls the gRPC service to let the user pick an object in Revit.
    """
    logging.info(f"Attempting to pick object (Type: {selection_type}, Filter: {category_filter}) via gRPC.")
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.PickObjectRequest(
                selection_type=selection_type,
                category_filter=category_filter if category_filter else ""
            )
            response = stub.PickObject(request)
            return {
                "value": response.value,
                "is_success": response.is_success,
                "cancelled": response.cancelled,
                "error_message": response.error_message
            }
    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.UNAVAILABLE:
            return {
                "value": "",
                "is_success": False,
                "cancelled": False,
                "error_message": GRPC_UNAVAILABLE_MSG
            }
        logging.error(format_grpc_error(e))
        return {
            "is_success": False,
            "error_message": f"gRPC error: {e.details()}"
        }
    except Exception as e:
        logging.error(f"An unexpected error occurred during gRPC PickObject call: {e}")
        return {
            "is_success": False,
            "error_message": f"Unexpected error: {str(e)}"
        }

def rename_script(old_path: str, new_name: str):
    """
    Calls the gRPC service to rename a script file.
    """
    logging.info(f"Attempting to rename script '{old_path}' to '{new_name}' via gRPC.")
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.RenameScriptRequest(
                old_path=old_path,
                new_name=new_name
            )
            response = stub.RenameScript(request)
            return {
                "is_success": response.is_success,
                "new_path": response.new_path,
                "error_message": response.error_message
            }
    except grpc.RpcError as e:
        logging.error(format_grpc_error(e))
        return {
            "is_success": False,
            "new_path": "",
            "error_message": f"gRPC error: {e.details()}"
        }
    except Exception as e:
        logging.error(f"An unexpected error occurred during gRPC RenameScript call: {e}")
        return {
            "is_success": False,
            "new_path": "",
            "error_message": f"Unexpected error: {str(e)}"
        }
def build_script(script_content):
    """
    Calls the gRPC service to compile a script and return the assembly bytes.
    """
    logging.info("Attempting to build script via gRPC.")
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.BuildScriptRequest(
                script_content=script_content
            )
            response = stub.BuildScript(request)
            return {
                "is_success": response.is_success,
                "compiled_assembly": response.compiled_assembly,
                "error_message": response.error_message
            }
    except grpc.RpcError as e:
        logging.error(format_grpc_error(e))
        return {
            "is_success": False,
            "error_message": f"gRPC error: {e.details()}"
        }
    except Exception as e:
        logging.error(f"An unexpected error occurred during gRPC BuildScript call: {e}")
        return {
            "is_success": False,
            "error_message": f"Unexpected error: {str(e)}"
        }

def get_category_parameters(category_name: str):
    """
    Calls the gRPC service to get parameter definitions for a category.
    """
    logging.info(f"Fetching parameters for category: {category_name}")
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.GetCategoryParametersRequest(category_name=category_name)
            response = stub.GetCategoryParameters(request)
            
            params = []
            for p in response.parameters:
                # Differentiate identical names with extra context: Name [StorageType][Type/Instance][BuiltInName]
                storage = p.storage_type or "Unknown"
                is_type_val = getattr(p, 'is_type', False)
                type_or_instance = "Type" if is_type_val else "Instance"
                builtin = p.builtin_name if p.builtin_name else ""
                
                # Compose enriched display name
                display_name = f"{p.name} [{storage}][{type_or_instance}]"
                if builtin:
                    display_name += f"[{builtin}]"

                params.append({
                    "name": p.name,
                    "displayName": display_name,
                    "storage_type": p.storage_type,
                    "is_builtin": p.is_builtin,
                    "builtin_id": p.builtin_id,
                    "builtin_name": p.builtin_name,
                    "revit_element_type": p.revit_element_type,
                    "spec_type_id": p.spec_type_id,
                    "is_type": is_type_val
                })
            
            return {
                "parameters": params,
                "error_message": response.error_message
            }
    except grpc.RpcError as e:
        logging.error(format_grpc_error(e))
        return {
            "parameters": [],
            "error_message": f"gRPC error: {e.details()}"
        }
def unregister_watchdog_source(path: str):
    """
    Calls the gRPC service to stop all watchdogs from a specific source folder.
    """
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.UnregisterWatchdogSourceRequest(path=path)
            response = stub.UnregisterWatchdogSource(request)
            return {
                "is_success": response.is_success,
                "error_message": response.error_message,
                "watchdogs_removed": response.watchdogs_removed
            }
    except grpc.RpcError as e:
        logging.error(format_grpc_error(e))
        return {
            "is_success": False,
            "error_message": f"gRPC Error: {e.details()}",
            "watchdogs_removed": 0
        }
    except Exception as e:
        logging.error(f"Error calling UnregisterWatchdogSource: {e}")
        return {
            "is_success": False,
            "error_message": str(e),
            "watchdogs_removed": 0
        }

def clear_assembly_cache():
    """
    Calls the gRPC service to clear the internal in-memory assembly cache.
    """
    try:
        with get_corescript_runner_stub() as stub:
            response = stub.ClearAssemblyCache(corescript_pb2.ClearAssemblyCacheRequest())
            return {
                "is_success": response.is_success,
                "message": response.message
            }
    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.UNAVAILABLE:
            return {"is_success": False, "message": GRPC_UNAVAILABLE_MSG}
        logging.error(format_grpc_error(e))
        return {"is_success": False, "message": f"gRPC Error: {e.details()}"}

def execute_repl(code: str, session_id: str, license_tier: str = "free",
                 execution_mode: str = "read_write", source: str = "paracore"):
    """
    Calls the gRPC service to execute a REPL command in Revit.

    Args:
        code: The C# code to execute.
        session_id: Session identifier for REPL state persistence.
        license_tier: License tier string.
        execution_mode: "read_only" or "read_write" (default).
        source: Caller identifier — "mcp_agent", "paracore_agent", "paracore_ui", "paracore".
    """
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.ExecuteReplRequest(
                code=code,
                session_id=session_id,
                license_tier=license_tier,
                execution_mode=execution_mode,
                source=source
            )
            response = stub.ExecuteRepl(request)
            structured_output_data = [{"type": item.type, "data": item.data, "title": item.title} for item in getattr(response, 'structured_output', [])]
            pipeline_diags = list(getattr(response, 'pipeline_diagnostics', []))
            return {
                "is_success": response.is_success,
                "output": response.output,
                "error_message": response.error_message,
                "structured_output": structured_output_data,
                "pipeline_diagnostics": pipeline_diags,
                "user_rejected": getattr(response, 'user_rejected', False),
                "read_only_violation": getattr(response, 'read_only_violation', False),
            }
    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.UNAVAILABLE:
            return {"is_success": False, "output": "", "error_message": GRPC_UNAVAILABLE_MSG,
                    "user_rejected": False, "read_only_violation": False}
        logging.error(format_grpc_error(e))
        return {"is_success": False, "output": "", "error_message": f"gRPC Error: {e.details()}",
                "user_rejected": False, "read_only_violation": False}
    except Exception as e:
        logging.error(f"Error calling ExecuteRepl gRPC: {e}")
        return {"is_success": False, "output": "", "error_message": str(e),
                "user_rejected": False, "read_only_violation": False}
