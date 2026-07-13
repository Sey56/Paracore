import time
import grpc
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from grpc_client import get_status

router = APIRouter()

# Simple cache to avoid repeated gRPC calls blocking the server when Revit isn't open
_cache: dict[str, tuple[float, dict]] = {}
CACHE_TTL = 5.0  # seconds


def _cached(key: str, factory):
    now = time.time()
    if key in _cache:
        ts, val = _cache[key]
        if now - ts < CACHE_TTL:
            return val
    val = factory()
    _cache[key] = (now, val)
    return val


def _get_status():
    try:
        response = get_status()
        return {
            "paracoreConnected": response.paracore_connected,
            "revitOpen": response.revit_open,
            "revitVersion": response.revit_version or "",
            "documentOpen": response.document_open,
            "documentTitle": response.document_title or "",
            "documentType": response.document_type or "None",
            "revitInstallPath": response.revit_install_path or "",
            "addinServerPath": response.addin_server_path or "",
            "isPro": response.is_pro if hasattr(response, 'is_pro') else False,
        }
    except Exception:
        return {
            "paracoreConnected": False,
            "revitOpen": False,
            "revitVersion": None,
            "documentOpen": False,
            "documentTitle": None,
            "documentType": "None",
            "isPro": False,
        }


@router.get("/api/status", tags=["status"])
async def get_status_endpoint():
    return JSONResponse(content=_cached("status", _get_status))


def _get_watchdogs():
    from grpc_client import get_watchdog_statuses
    return get_watchdog_statuses()


@router.get("/api/watchdogs", tags=["status"])
async def get_watchdogs_endpoint():
    return _cached("watchdogs", _get_watchdogs)
