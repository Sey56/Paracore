import * as grpc from '@grpc/grpc-js';

export declare namespace RScript {

  interface ExecuteScriptRequest {
    script_content: string;
    parameters_json: Uint8Array;
    source?: string; // New: Optional source field
  }

  interface ExecuteScriptResponse {
    is_success: boolean;
    output: string;
    error_message: string;
    error_details: string[];
  }

  interface GetStatusRequest {}

  interface GetStatusResponse {
    rserverConnected: boolean;
    revitOpen: boolean;
    revitVersion: string;
    documentOpen: boolean;
    documentTitle: string;
  }

  interface RScriptRunnerClient extends grpc.Client {
    ExecuteScript(request: ExecuteScriptRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: grpc.requestCallback<ExecuteScriptResponse>): grpc.ClientUnaryCall;
    ExecuteScript(request: ExecuteScriptRequest, callback: grpc.requestCallback<ExecuteScriptResponse>): grpc.ClientUnaryCall;
    
    GetStatus(request: GetStatusRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: grpc.requestCallback<GetStatusResponse>): grpc.ClientUnaryCall;
    GetStatus(request: GetStatusRequest, callback: grpc.requestCallback<GetStatusResponse>): grpc.ClientUnaryCall;
  }

  interface RScriptRunnerService {
    ExecuteScript: grpc.handleUnaryCall<ExecuteScriptRequest, ExecuteScriptResponse>;
    GetStatus: grpc.handleUnaryCall<GetStatusRequest, GetStatusResponse>;
  }
}
