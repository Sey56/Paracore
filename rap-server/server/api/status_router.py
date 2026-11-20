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
    # The sidecar has ONE install home: the Revit add-in folder. Reporting this
    # lets the UI say "add-in required" instead of a misleading red Disconnected
    # when the desktop app is running on a machine with no add-in installed.
    from services.sidecar_manager import find_sidecar_exe
    sidecar_installed = find_sidecar_exe() is not None
    try:
        response = get_status()
        return {
            "paracoreConnected": response.paracore_connected,
            "sidecarInstalled": sidecar_installed,
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
            "sidecarInstalled": sidecar_installed,
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


@router.get("/api/sidecar-status", tags=["status"])
async def get_sidecar_status_endpoint():
    """Who started Paracore.Server.exe and is it answering right now.

    Uncached on purpose: this is the endpoint used to confirm that toggling the
    Revit ribbon does NOT kill the desktop's connection to the shared sidecar,
    so a 5-second cache would hide exactly the transition being checked.
    """
    from services.sidecar_manager import sidecar_manager
    return JSONResponse(content=sidecar_manager.status())


def _get_watchdogs():
    from grpc_client import get_watchdog_statuses
    return get_watchdog_statuses()


@router.get("/api/watchdogs", tags=["status"])
async def get_watchdogs_endpoint():
    return _cached("watchdogs", _get_watchdogs)
