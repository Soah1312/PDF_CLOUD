import io
import time
import uuid
import logging
from typing import List, Dict, Any, Tuple, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.user import User
from app.schemas.workflow import WorkflowStepExecution
from app.services.pdf_engine import PDFEngineService
from app.services.canary_service import CanaryService
from app.services.file_validator import validate_pdf_content, sanitize_filename

logger = logging.getLogger("cloudpdf.workflow_engine")

SUPPORTED_PIPELINE_ACTIONS = {
    "rotate",
    "watermark",
    "compress",
    "protect",
    "unlock",
    "ocr",
    "scrub_metadata",
    "canary_watermark",
}


class WorkflowExecutionError(Exception):
    def __init__(
        self,
        step_index: int,
        action: str,
        message: str,
        step_results: List[WorkflowStepExecution]
    ):
        super().__init__(f"Step {step_index} ({action}) failed: {message}")
        self.step_index = step_index
        self.action = action
        self.message = message
        self.step_results = step_results


class WorkflowEngineService:
    """
    Dedicated workflow pipeline orchestration service.
    Sequentially chains PDF transformations in-memory with strict atomic error boundaries.
    """

    @classmethod
    def validate_steps(cls, steps: List[Dict[str, Any]]) -> None:
        """Validates that all steps in the pipeline are supported and well-formed."""
        if not steps or len(steps) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Workflow pipeline must contain at least one step."
            )

        if len(steps) > 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Workflow exceeds maximum limit of 10 sequential steps."
            )

        for idx, step in enumerate(steps, start=1):
            if not isinstance(step, dict):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Step {idx} definition must be an object."
                )

            action = step.get("action", "").lower().strip()
            if not action:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Step {idx} is missing required 'action' field."
                )

            if action not in SUPPORTED_PIPELINE_ACTIONS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Step {idx} action '{action}' is not supported in automated pipelines. Supported: {', '.join(sorted(SUPPORTED_PIPELINE_ACTIONS))}"
                )

            params = step.get("params", {})
            if not isinstance(params, dict):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Step {idx} 'params' must be a dictionary."
                )

            # Specific step validation
            if action == "rotate":
                angle = params.get("angle", 90)
                if angle not in (90, 180, 270):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Step {idx} (rotate): angle must be 90, 180, or 270."
                    )
            elif action == "watermark":
                text = params.get("text", "")
                if not text or len(str(text).strip()) == 0:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Step {idx} (watermark): watermark 'text' cannot be empty."
                    )
            elif action == "protect":
                pwd = params.get("password", "")
                if not pwd or len(str(pwd).strip()) == 0:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Step {idx} (protect): 'password' cannot be empty."
                    )
            elif action == "unlock":
                pwd = params.get("password", "")
                if not pwd or len(str(pwd).strip()) == 0:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Step {idx} (unlock): 'password' cannot be empty."
                    )

    @classmethod
    def execute_pipeline(
        cls,
        file_bytes: bytes,
        steps: List[Dict[str, Any]],
        user: Optional[User] = None,
        original_filename: str = "document.pdf",
        db: Optional[Session] = None
    ) -> Tuple[bytes, List[WorkflowStepExecution], str]:
        """
        Executes a sequence of PDF transformations sequentially in-memory.

        Returns:
            Tuple[final_bytes, step_results, output_filename]

        Raises:
            WorkflowExecutionError: If any intermediate step fails.
        """
        # File limit check (e.g. 50 MB)
        MAX_PIPELINE_FILE_BYTES = 50 * 1024 * 1024
        if len(file_bytes) > MAX_PIPELINE_FILE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Document exceeds 50 MB memory safety threshold for pipeline execution."
            )

        validate_pdf_content(file_bytes, filename=original_filename)
        cls.validate_steps(steps)

        current_bytes = file_bytes
        step_results: List[WorkflowStepExecution] = []
        total_steps = len(steps)

        for idx, step_def in enumerate(steps, start=1):
            action = step_def.get("action", "").lower().strip()
            params = step_def.get("params", {})
            t_start = time.perf_counter()

            try:
                if action == "rotate":
                    angle = int(params.get("angle", 90))
                    page_nums = params.get("page_numbers") or params.get("pages")
                    current_bytes = PDFEngineService.rotate_pdf(
                        file_bytes=current_bytes,
                        angle=angle,
                        page_numbers=page_nums,
                        original_filename=original_filename
                    )

                elif action == "watermark":
                    text = str(params.get("text", "CONFIDENTIAL"))
                    font_size = int(params.get("font_size", 40))
                    opacity = float(params.get("opacity", 0.3))
                    rotation = float(params.get("rotation", 45.0))
                    color = str(params.get("color", "#888888"))
                    position = str(params.get("position", "center"))
                    pages = params.get("pages")
                    current_bytes = PDFEngineService.watermark_pdf(
                        file_bytes=current_bytes,
                        text=text,
                        font_size=font_size,
                        opacity=opacity,
                        rotation=rotation,
                        position=position,
                        color=color,
                        pages=pages,
                        original_filename=original_filename
                    )

                elif action == "compress":
                    level = str(params.get("level", "medium")).lower()
                    compressed_bytes, _ = PDFEngineService.compress_pdf(
                        file_bytes=current_bytes,
                        level=level,
                        original_filename=original_filename
                    )
                    current_bytes = compressed_bytes

                elif action == "protect":
                    password = str(params.get("password", ""))
                    current_bytes = PDFEngineService.protect_pdf(
                        file_bytes=current_bytes,
                        password=password,
                        original_filename=original_filename
                    )

                elif action == "unlock":
                    password = str(params.get("password", ""))
                    current_bytes = PDFEngineService.unlock_pdf(
                        file_bytes=current_bytes,
                        password=password,
                        original_filename=original_filename
                    )

                elif action == "scrub_metadata":
                    current_bytes = PDFEngineService.scrub_metadata_pdf(
                        file_bytes=current_bytes,
                        original_filename=original_filename
                    )

                elif action == "ocr":
                    lang = str(params.get("language", "eng"))
                    current_bytes = PDFEngineService.ocr_pdf(
                        file_bytes=current_bytes,
                        language=lang,
                        original_filename=original_filename
                    )

                elif action == "canary_watermark":
                    token_id = CanaryService.generate_token_id()
                    watermarked_bytes, _, _ = CanaryService.embed_watermark(
                        file_bytes=current_bytes,
                        token_id=token_id,
                        recipient_metadata=params,
                        original_filename=original_filename
                    )
                    current_bytes = watermarked_bytes

                else:
                    raise ValueError(f"Unsupported action: {action}")

                elapsed_ms = round((time.perf_counter() - t_start) * 1000, 2)
                step_results.append(
                    WorkflowStepExecution(
                        step_index=idx,
                        action=action,
                        status="COMPLETED",
                        duration_ms=elapsed_ms
                    )
                )

            except Exception as step_err:
                elapsed_ms = round((time.perf_counter() - t_start) * 1000, 2)
                logger.error(f"[WorkflowEngine] Step {idx} ({action}) failed: {step_err}")

                step_results.append(
                    WorkflowStepExecution(
                        step_index=idx,
                        action=action,
                        status="FAILED",
                        duration_ms=elapsed_ms,
                        error_message=str(step_err)
                    )
                )

                # Mark remaining steps as SKIPPED
                for remaining_idx in range(idx + 1, total_steps + 1):
                    rem_action = steps[remaining_idx - 1].get("action", "unknown")
                    step_results.append(
                        WorkflowStepExecution(
                            step_index=remaining_idx,
                            action=rem_action,
                            status="SKIPPED",
                            duration_ms=0.0
                        )
                    )

                raise WorkflowExecutionError(
                    step_index=idx,
                    action=action,
                    message=str(step_err),
                    step_results=step_results
                )

        output_filename = f"pipeline_{sanitize_filename(original_filename)}"
        return current_bytes, step_results, output_filename


workflow_engine = WorkflowEngineService()
