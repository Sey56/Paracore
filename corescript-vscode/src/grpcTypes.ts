import { CoreScript as CoreScriptProto } from "./grpcClient";

export namespace CoreScript {
    export type ExecuteScriptRequest = typeof CoreScriptProto.ExecuteScriptRequest.prototype;
    export type ExecuteScriptResponse = typeof CoreScriptProto.ExecuteScriptResponse.prototype;
    export type GetStatusRequest = typeof CoreScriptProto.GetStatusRequest.prototype;
    export type GetStatusResponse = typeof CoreScriptProto.GetStatusResponse.prototype;
    export type GetScriptMetadataRequest = typeof CoreScriptProto.GetScriptMetadataRequest.prototype;
    export type GetScriptMetadataResponse = typeof CoreScriptProto.GetScriptMetadataResponse.prototype;
    export type GetScriptParametersRequest = typeof CoreScriptProto.GetScriptParametersRequest.prototype;
    export type GetScriptParametersResponse = typeof CoreScriptProto.GetScriptParametersResponse.prototype;
    export type GetCombinedScriptRequest = typeof CoreScriptProto.GetCombinedScriptRequest.prototype;
    export type GetCombinedScriptResponse = typeof CoreScriptProto.GetCombinedScriptResponse.prototype;
    export type CreateWorkspaceRequest = typeof CoreScriptProto.CreateWorkspaceRequest.prototype;
    export type CreateWorkspaceResponse = typeof CoreScriptProto.CreateWorkspaceResponse.prototype;
    export type ScriptFile = typeof CoreScriptProto.ScriptFile.prototype;
    export type StructuredOutputItem = typeof CoreScriptProto.StructuredOutputItem.prototype;
    export type ScriptMetadata = typeof CoreScriptProto.ScriptMetadata.prototype;
    export type ScriptParameter = typeof CoreScriptProto.ScriptParameter.prototype;
}
