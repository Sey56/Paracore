import json
import logging

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
        # Build dict manually to guarantee field names and values
        result = {
            "paracoreConnected": response.paracore_connected,
            "revitOpen": response.revit_open,
            "revitVersion": response.revit_version or "",
            "documentOpen": response.document_open,
            "documentTitle": response.document_title or "",
            "documentType": response.document_type or "None",
            "revitInstallPath": response.revit_install_path or "",
            "addinServerPath": response.addin_server_path or "",
            "isPro": response.is_pro,
        }
        return JSONResponse(content=result)
    except Exception as e:
        logging.getLogger(__name__).error(f"[STATUS HTTP] Error: {e}", exc_info=True)
        return JSONResponse(content={
            "paracoreConnected": False,
            "revitOpen": False,
            "revitVersion": None,
            "documentOpen": False,
            "documentTitle": None,
            "documentType": "None",
            "isPro": False,
        })

@router.get("/api/watchdogs", tags=["status"])
async def get_watchdogs_endpoint():
    """
    Returns active background watchdogs and their latest health reports.
    """
    from grpc_client import get_watchdog_statuses
    return get_watchdog_statuses()
