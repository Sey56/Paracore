from fastapi import APIRouter
from pydantic import BaseModel
from services import manifest_service

router = APIRouter()

class GenerateManifestRequest(BaseModel):
    agent_scripts_path: str

@router.post("/api/manifest/generate", tags=["Manifest Management"])
async def generate_manifest(request: GenerateManifestRequest):
    return await manifest_service.generate_manifest_logic(request.agent_scripts_path)
