import os
import logging
from contextlib import contextmanager
import grpc
import corescript_pb2
import corescript_pb2_grpc
from google.protobuf import json_format

import json

@contextmanager
def get_rscript_runner_stub():
    """Provides a gRPC stub within a managed context."""
    channel = None
    try:
        grpc_server_address = os.environ.get('GRPC_SERVER_ADDRESS', 'localhost:50051')
        # logging.info(f"Attempting to connect to gRPC server at: {grpc_server_address}")
        channel = grpc.insecure_channel(grpc_server_address)
        stub = corescript_pb2_grpc.CoreScriptRunnerStub(channel)
        # logging.info("gRPC channel and stub created successfully.")
        yield stub
    except Exception as e:
        logging.error(f"Failed to create gRPC channel or stub: {e}")
        raise # Re-raise the exception
    finally:
        if channel:
            channel.close()

def get_status():
    # logging.info("Attempting to get gRPC server status.")
    try:
        with get_rscript_runner_stub() as stub:
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
    with get_rscript_runner_stub() as stub:
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
            }
        except grpc.RpcError as e:
            logging.error(f"gRPC ExecuteScript call failed: {e.code()} - {e.details()}")
            raise # Re-raise the gRPC error

def get_script_metadata(script_files):
    with get_rscript_runner_stub() as stub:
        grpc_script_files = [corescript_pb2.ScriptFile(file_name=f['file_name'], content=f['content']) for f in script_files]
        request = corescript_pb2.GetScriptMetadataRequest(script_files=grpc_script_files)
        response = stub.GetScriptMetadata(request)
    
    metadata_dict = json_format.MessageToDict(
        response.metadata, 
        preserving_proto_field_name=True
    )

    return {
        "metadata": metadata_dict,
        "error_message": response.error_message
    }

def get_script_parameters(script_files):
    with get_rscript_runner_stub() as stub:
        grpc_script_files = [corescript_pb2.ScriptFile(file_name=f['file_name'], content=f['content']) for f in script_files]
        request = corescript_pb2.GetScriptParametersRequest(script_files=grpc_script_files)
        response = stub.GetScriptParameters(request)
    
    return {
        "parameters": [
            {
                "name": p.name,
                "type": p.type,
                "defaultValueJson": p.default_value_json,
                "description": p.description,
                "options": list(p.options)
            } for p in response.parameters
        ],
        "error_message": response.error_message
    }

def get_combined_script(script_files):
    with get_rscript_runner_stub() as stub:
        grpc_script_files = [corescript_pb2.ScriptFile(file_name=f['file_name'], content=f['content']) for f in script_files]
        request = corescript_pb2.GetCombinedScriptRequest(script_files=grpc_script_files)
        response = stub.GetCombinedScript(request)
    
    return {
        "combined_script": response.combined_script,
        "error_message": response.error_message
    }

def create_and_open_workspace(script_path, script_type):
    with get_rscript_runner_stub() as stub:
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
    with get_rscript_runner_stub() as stub:
        request = corescript_pb2.GetScriptManifestRequest(script_path=script_path)
        response = stub.GetScriptManifest(request)
        return response.manifest_json
