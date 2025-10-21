import logging

# Centralized gRPC channel management
@contextmanager
def get_rscript_runner_stub():
    """Provides a gRPC stub within a managed context."""    
    channel = None
    try:
        grpc_server_address = os.environ.get('GRPC_SERVER_ADDRESS', 'localhost:50051')
        channel = grpc.insecure_channel(grpc_server_address)
        yield rscript_pb2_grpc.RScriptRunnerStub(channel)
    finally:
        if channel:
            channel.close()

def get_status():
    with get_rscript_runner_stub() as stub:
        response = stub.GetStatus(rscript_pb2.GetStatusRequest())
    return response

def execute_script(script_content, parameters_json):
    logging.info("Attempting to execute script via gRPC.")
    with get_rscript_runner_stub() as stub:
        request = rscript_pb2.ExecuteScriptRequest(
            script_content=script_content.encode('utf-8'),
            parameters_json=parameters_json.encode('utf-8'),
            source="rap-web"
        )
        try:
            response = stub.ExecuteScript(request)
            logging.info("gRPC ExecuteScript call successful.")
        except grpc.RpcError as e:
            logging.error(f"gRPC ExecuteScript call failed: {e.code()} - {e.details()}")
            raise # Re-raise the gRPC error
    return {
        "is_success": response.is_success,
        "output": response.output,
        "error_message": response.error_message,
        "error_details": list(response.error_details),
        "showOutputData": [{"type": item.type, "data": item.data} for item in response.structured_output]
    }

def get_script_metadata(script_files):
    with get_rscript_runner_stub() as stub:
        grpc_script_files = [rscript_pb2.ScriptFile(file_name=f['file_name'], content=f['content']) for f in script_files]
        request = rscript_pb2.GetScriptMetadataRequest(script_files=grpc_script_files)
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
        grpc_script_files = [rscript_pb2.ScriptFile(file_name=f['file_name'], content=f['content']) for f in script_files]
        request = rscript_pb2.GetScriptParametersRequest(script_files=grpc_script_files)
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
        grpc_script_files = [rscript_pb2.ScriptFile(file_name=f['file_name'], content=f['content']) for f in script_files]
        request = rscript_pb2.GetCombinedScriptRequest(script_files=grpc_script_files)
        response = stub.GetCombinedScript(request)
    
    return {
        "combined_script": response.combined_script,
        "error_message": response.error_message
    }

def create_and_open_workspace(script_path, script_type):
    with get_rscript_runner_stub() as stub:
        request = rscript_pb2.CreateWorkspaceRequest(
            script_path=script_path,
            script_type=script_type
        )
        response = stub.CreateAndOpenWorkspace(request)
    return {
        "workspace_path": response.workspace_path,
        "error_message": response.error_message
    }
