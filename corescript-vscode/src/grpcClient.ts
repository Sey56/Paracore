import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { promisify } from 'util';

const PROTO_PATH = __dirname + '/../proto/corescript.proto';

const packageDefinition = protoLoader.loadSync(
    PROTO_PATH,
    {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    });

const coreScriptProto: any = grpc.loadPackageDefinition(packageDefinition).CoreScript;

const client = new (coreScriptProto.CoreScriptRunner as { new(address: string, credentials: grpc.ChannelCredentials, options?: Partial<grpc.ClientOptions>): any })('localhost:50051', grpc.credentials.createInsecure(), {
    'grpc.max_send_message_length': 50 * 1024 * 1024,
    'grpc.max_receive_message_length': 50 * 1024 * 1024
});

export const executeScript = promisify(client.ExecuteScript).bind(client) as (request: any) => Promise<any>;
export const getStatus = promisify(client.GetStatus).bind(client) as (request: any) => Promise<any>;

export const CoreScript = coreScriptProto;