from fastapi import APIRouter
from app.api.v1 import auth, files, pdf, history

api_router = APIRouter()

# Mount authentication & profile endpoints
api_router.include_router(auth.router)

# Mount file management endpoints
api_router.include_router(files.router)

# Mount PDF processing operations
api_router.include_router(pdf.router)

# Mount processing history endpoints
api_router.include_router(history.router)


