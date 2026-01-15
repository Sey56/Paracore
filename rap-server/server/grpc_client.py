import os
import logging
from contextlib import contextmanager
import grpc
import corescript_pb2
import corescript_pb2_grpc
from google.protobuf import json_format

import json

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

def get_status():
    # logging.info("Attempting to get gRPC server status.")
    try:
        with get_corescript_runner_stub() as stub:
            response = stub.GetStatus(corescript_pb2.GetStatusRequest())
        return response
    except grpc.RpcError as e:
        logging.error(f"gRPC GetStatus call failed: {e.code()} - {e.details()}")
        raise # Re-raise the gRPC error
    except Exception as e:
        logging.error(f"An unexpected error occurred during gRPC GetStatus call: {e}")
        raise # Re-raise the unexpected error

def execute_script(script_content, parameters_json):
    # logging.info("Attempting to execute script via gRPC.")
    with get_corescript_runner_stub() as stub:
        request = corescript_pb2.ExecuteScriptRequest(
            script_content=script_content.encode('utf-8'),
            parameters_json=parameters_json.encode('utf-8'),
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
            logging.error(f"gRPC ExecuteScript call failed: {e.code()} - {e.details()}")
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
        "script_type": m.script_type,
        "description": m.description,
        "author": m.author,
        "categories": list(m.categories),
        "dependencies": list(m.dependencies),
        "document_type": m.document_type,
        "usage_examples": list(m.usage_examples),
        "website": m.website,
        "last_run": m.last_run
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
    
    return {
        "combined_script": response.combined_script,
        "error_message": response.error_message
    }

def create_and_open_workspace(script_path, script_type):
    with get_corescript_runner_stub() as stub:
        request = corescript_pb2.CreateWorkspaceRequest(
            script_path=script_path,
            script_type=script_type
        )
        response = stub.CreateAndOpenWorkspace(request)
    return {
        "workspace_path": response.workspace_path,
        "error_message": response.error_message
    }

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
        logging.error(f"gRPC ValidateWorkingSet call failed: {e.code()} - {e.details()}")
        return [] # Return empty list on error
    except Exception as e:
        logging.error(f"An unexpected error occurred during gRPC ValidateWorkingSet call: {e}")
        return [] # Return empty list on error

def compute_parameter_options(script_content: str, parameter_name: str):
    """
    Calls the gRPC service to execute the {parameter_name}_Options() function in Revit.
    """
    logging.info(f"Attempting to compute options for parameter '{parameter_name}' via gRPC.")
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.ComputeParameterOptionsRequest(
                script_content=script_content,
                parameter_name=parameter_name
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
        logging.error(f"gRPC ComputeParameterOptions call failed: {e.code()} - {e.details()}")
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
            logging.error(f"gRPC SelectElements call failed: {e.code()} - {e.details()}")
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
        logging.error(f"gRPC PickObject call failed: {e.code()} - {e.details()}")
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
