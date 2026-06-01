from fastapi import APIRouter
from fastapi.responses import JSONResponse

NOT_IMPLEMENTED_PAYLOAD = {
    "code": "NOT_IMPLEMENTED",
    "message": "暂未实现，当前版本暂不支持该功能。",
}

router = APIRouter(tags=["not-implemented"])


def not_implemented_response() -> JSONResponse:
    return JSONResponse(status_code=501, content=NOT_IMPLEMENTED_PAYLOAD)


@router.api_route("/device-integrations/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def device_integrations_placeholder(path: str):
    return not_implemented_response()


@router.api_route("/pilot-materials/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def pilot_materials_placeholder(path: str):
    return not_implemented_response()


@router.api_route("/report-templates/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def report_templates_placeholder(path: str):
    return not_implemented_response()


@router.api_route("/deliverables/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def deliverables_placeholder(path: str):
    return not_implemented_response()
