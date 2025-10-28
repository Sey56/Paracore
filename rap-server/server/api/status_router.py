import grpc
import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from google.protobuf import json_format

from ..grpc_client import get_status

router = APIRouter()

@router.get("/api/status", tags=["status"])
async def get_status_endpoint():
    """
    Checks the status of the gRPC server connection.
    """
    try:
        response = get_status()
        # print(f"[DEBUG] Raw GetStatusResponse from RServer.Addin: {response}") # DEBUG LOG
        return JSONResponse(content=json.loads(json_format.MessageToJson(response)))
    except grpc.RpcError:
        return JSONResponse(content={
            "rserverConnected": False,
            "revitOpen": False,
            "revitVersion": None,
            "documentOpen": False,
            "documentTitle": None,
            "documentType": "None"
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))