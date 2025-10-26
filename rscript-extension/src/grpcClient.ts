import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { promisify } from 'util';
// Removed: import { RScript } from './grpcTypes'; // This import caused the error

const PROTO_PATH = __dirname + '/../proto/rscript.proto';

const packageDefinition = protoLoader.loadSync(
    PROTO_PATH,
    {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    });

const rscriptProto: any = grpc.loadPackageDefinition(packageDefinition).RScript;

const client = new (rscriptProto.RScriptRunner as { new(address: string, credentials: grpc.ChannelCredentials, options?: Partial<grpc.ClientOptions>): any })('localhost:50051', grpc.credentials.createInsecure(), { // Changed type to 'any' for simplicity
    'grpc.max_send_message_length': 50 * 1024 * 1024, // 50 MB
    'grpc.max_receive_message_length': 50 * 1024 * 1024 // 50 MB
});

export const executeScript = promisify(client.ExecuteScript).bind(client) as (request: any) => Promise<any>; // Changed type to 'any' for simplicity
export const getStatus = promisify(client.GetStatus).bind(client) as (request: any) => Promise<any>; // Changed type to 'any' for simplicity

// New: Export the RScript namespace from the loaded proto object
export const RScript = rscriptProto;