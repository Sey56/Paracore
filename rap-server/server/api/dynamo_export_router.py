import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services import dynamo_export_service

router = APIRouter(prefix="/api/scripts", tags=["Dynamo Export"])


class ExportDynamoRequest(BaseModel):
    scriptPath: str
    exportKind: str = "Methods"
    outputFolder: Optional[str] = ""
    packageName: Optional[str] = ""
    assemblyName: Optional[str] = ""
    nodeClassName: Optional[str] = ""
    classPrefix: Optional[str] = ""
    graphName: Optional[str] = ""
    dynamoVersion: Optional[str] = "3.3"
    dryRun: bool = True
    overwriteExisting: bool = False


@router.post("/export-dynamo")
async def export_dynamo_endpoint(request: ExportDynamoRequest):
    """Export a gallery script to Dynamo using the product-owned engine helpers."""
    try:
        return dynamo_export_service.export_dynamo(request.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logging.exception("Dynamo export failed")
        raise HTTPException(status_code=500, detail=str(exc))
