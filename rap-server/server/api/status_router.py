import json

import grpc
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from google.protobuf import json_format
from grpc_client import get_status

router = APIRouter()

@router.get("/api/status", tags=["status"])
async def get_status_endpoint():
    """
    Checks the status of the gRPC server connection.
    """
    try:
        response = get_status()
        return JSONResponse(content=json.loads(json_format.MessageToJson(response)))
    except Exception:
        return JSONResponse(content={
            "paracoreConnected": False,
            "revitOpen": False,
            "revitVersion": None,
            "documentOpen": False,
            "documentTitle": None,
            "documentType": "None"
        })

@router.get("/api/watchdogs", tags=["status"])
async def get_watchdogs_endpoint():
    """
    Returns active background watchdogs and their latest health reports.
    """
    from grpc_client import get_watchdog_statuses
    return get_watchdog_statuses()
