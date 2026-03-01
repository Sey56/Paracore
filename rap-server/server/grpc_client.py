import logging
import os
import json
from contextlib import contextmanager
from typing import Optional

import corescript_pb2
import corescript_pb2_grpc
import grpc
from utils import format_grpc_error

# Global channel variable
_channel = None

def init_channel():
    """Initializes the global gRPC channel."""
    global _channel
    if _channel is None:
        grpc_server_address = os.environ.get('GRPC_SERVER_ADDRESS', 'localhost:50051')
        logging.info(f"Initializing gRPC channel to {grpc_server_address}")
        _channel = grpc.insecure_channel(grpc_server_address)

def close_channel():
    """Closes the global gRPC channel."""
    global _channel
    if _channel:
        logging.info("Closing gRPC channel")
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
            logging.warning("Global gRPC channel not initialized. Creating temporary channel.")
            grpc_server_address = os.environ.get('GRPC_SERVER_ADDRESS', 'localhost:50051')
            local_channel = grpc.insecure_channel(grpc_server_address)
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
        return response
    except grpc.RpcError as e:
        logging.error(format_grpc_error(e))
        raise # Re-raise the gRPC error
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
    except Exception as e:
        logging.error(f"Error calling GetWatchdogStatus gRPC: {e}")
        return {"watchdogs": [], "error_message": str(e)}

def execute_script(script_content, parameters_json, compiled_assembly=None):
    # logging.info("Attempting to execute script via gRPC.")
    with get_corescript_runner_stub() as stub:
        request = corescript_pb2.ExecuteScriptRequest(
            script_content=script_content.encode('utf-8') if script_content else b"",
            parameters_json=parameters_json.encode('utf-8'),
            compiled_assembly=compiled_assembly if compiled_assembly else b"",
            source="Paracore"
        )
        try:
            response = stub.ExecuteScript(request)
            # logging.info("gRPC ExecuteScript call successful.")
            # Process and return the successful response
            structured_output_data = [{"type": item.type, "data": item.data} for item in response.structured_output]

            return {
                "is_success": response.is_success,
                "output": response.output,
                "error_message": response.error_message,
                "error_details": list(response.error_details),
                "structured_output": structured_output_data,
                "internal_data": response.internal_data,
            }
        except grpc.RpcError as e:
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

    # Manually construct the dictionary to avoid potential issues with MessageToDict
    params_to_return = []
    for p in response.parameters:
        param_dict = {
            "name": p.name,
            "type": p.type,
            "defaultValueJson": p.default_value_json,
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
            "selectionType": p.selection_type
        }
        params_to_return.append(param_dict)

    return {
        "parameters": params_to_return,
        "error_message": response.error_message
    }

def get_combined_script(script_files):
    with get_corescript_runner_stub() as stub:
        grpc_script_files = [corescript_pb2.ScriptFile(file_name=f['file_name'], content=f['content']) for f in script_files]
        request = corescript_pb2.GetCombinedScriptRequest(script_files=grpc_script_files)
        response = stub.GetCombinedScript(request)

    print(f"DEBUG: gRPC GetCombinedScript response length: {len(response.combined_script) if response.combined_script else 0}")
    if response.error_message:
        print(f"DEBUG: gRPC GetCombinedScript error: {response.error_message}")

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
        
        params_list = []
        for p in pm.parameters:
            val = p.default_value_json
            try:
                real_val = json.loads(val)
            except:
                real_val = val

            params_list.append({
                "name": p.name,
                "type": p.type,
                "defaultValue": real_val,
                "value": real_val,
                "description": p.description,
                "options": list(p.options),
                "multiSelect": p.multi_select,
                "inputType": p.input_type,
                "group": p.group
            })

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
    with get_corescript_runner_stub() as stub:
        request = corescript_pb2.CreateWorkspaceRequest(
            script_path=tool_path
        )
        response = stub.CreateAndOpenWorkspace(request)
    return {
        "workspace_path": response.workspace_path,
        "error_message": response.error_message
    }

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

def get_script_manifest(script_path: str) -> str:
    """
    Calls the gRPC service to get a JSON manifest of scripts from a given path.
    """
    with get_corescript_runner_stub() as stub:
        request = corescript_pb2.GetScriptManifestRequest(script_path=script_path)
        response = stub.GetScriptManifest(request)
        return response.manifest_json

def get_context():
    """
    Calls the gRPC service to get the current Revit context (selection, view, etc.).
    """
    print("DEBUG: grpc_client.get_context called")
    try:
        with get_corescript_runner_stub() as stub:
            print("DEBUG: Stub created, sending GetContextRequest...")
            request = corescript_pb2.GetContextRequest()
            response = stub.GetContext(request)
            print("DEBUG: Received GetContextResponse")

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
    except Exception as e:
        print(f"DEBUG: grpc_client.get_context exception: {e}")
        raise e

def validate_working_set_grpc(element_ids: list[int]) -> list[int]:
    """
    Calls the gRPC service to validate a list of element IDs against the active Revit document.
    """
    logging.info(f"Attempting to validate {len(element_ids)} element IDs via gRPC.")
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.ValidateWorkingSetRequest(element_ids=element_ids)
            response = stub.ValidateWorkingSet(request)
            valid_ids = list(response.valid_element_ids)
            logging.info(f"gRPC ValidateWorkingSet call successful. {len(valid_ids)} IDs are valid.")
            return valid_ids
    except grpc.RpcError as e:
        logging.error(format_grpc_error(e))
        return [] # Return empty list on error
    except Exception as e:
        logging.error(f"An unexpected error occurred during gRPC ValidateWorkingSet call: {e}")
        return [] # Return empty list on error

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

def update_element_parameter(element_id: int, parameter_name: str, new_value_string: str):
    """
    Calls the gRPC service to update a parameter on a specific element.
    """
    logging.info(f"Attempting to update parameter '{parameter_name}' on element {element_id} via gRPC.")
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.UpdateElementParameterRequest(
                element_id=element_id,
                parameter_name=parameter_name,
                new_value_string=new_value_string
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
                    new_value_string=str(u["new_value_string"])
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
                params.append({
                    "name": p.name,
                    "storage_type": p.storage_type,
                    "is_builtin": p.is_builtin,
                    "builtin_id": p.builtin_id,
                    "builtin_name": p.builtin_name,
                    "revit_element_type": p.revit_element_type,
                    "spec_type_id": p.spec_type_id,
                    "is_type": getattr(p, 'is_type', False)
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
