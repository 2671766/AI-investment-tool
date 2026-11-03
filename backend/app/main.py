"""FastAPI service for the AI Investment Decision-Support web app.

The API is stateless: the browser holds the case (and saves it as JSON or as a workbook), and
every request sends the whole case. That keeps the web app simple to run locally and means no
case data is ever stored on the server.

Run (from the backend folder):  uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from fastapi import Body, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from aidsm import constants as C
from aidsm import montecarlo
from aidsm.compute import evaluate
from aidsm.model import blank_case, normalise
from aidsm.xlsx_io import export_workbook, import_workbook

DATA = Path(__file__).resolve().parents[1] / "aidsm" / "data"
FRONTEND = Path(__file__).resolve().parents[2] / "frontend" / "dist"
MAX_UPLOAD = 25 * 1024 * 1024


def _clean(o):
    """JSON has no NaN or infinity; send them as null."""
    if isinstance(o, float):
        return None if (math.isnan(o) or math.isinf(o)) else o
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    return o


class CleanJSON(JSONResponse):
    def render(self, content) -> bytes:
        return json.dumps(_clean(content), ensure_ascii=False, default=str).encode("utf-8")


app = FastAPI(title="AI Investment Decision-Support Model - web app", version=C.ENGINE_VERSION,
              default_response_class=CleanJSON)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health():
    return {"status": "ok", "model_version": C.MODEL_VERSION, "engine_version": C.ENGINE_VERSION}


@app.get("/api/config")
def config():
    return {
        "model_name": C.MODEL_NAME, "model_version": C.MODEL_VERSION, "engine_version": C.ENGINE_VERSION,
        "alt_ids": C.ALT_IDS, "benchmark_ids": list(C.BENCHMARK_IDS), "max_years": C.MAX_YEARS,
        "risk": [{"id": i, "name": n, "definition": d} for i, n, d in zip(C.RISK_IDS, C.RISK_NAMES, C.RISK_DEFINITIONS)],
        "score_meaning": C.SCORE_MEANING,
        "benchmark_weights": C.BENCHMARK_WEIGHTS, "benchmark_lambda": C.BENCHMARK_LAMBDA,
        "lists": {"case_status": C.LIST_CASE_STATUS, "source_type": C.LIST_SOURCE_TYPE,
                  "confidence": C.LIST_CONFIDENCE, "benefit_method": C.LIST_BENEFIT_METHOD,
                  "critical": C.LIST_CRITICAL, "alt_type": C.LIST_ALT_TYPE, "distribution": C.LIST_DIST,
                  "iterations": C.LIST_ITERATIONS, "monitor_status": C.LIST_MONITOR_STATUS,
                  "monitor_evidence": C.LIST_MONITOR_EVIDENCE},
        "levels": C.LEVEL_LABELS,
        "mc_variables": [{"id": v, "name": n, "unit": u, "domain": C.MC_DOMAINS[v]} for v, n, u in C.MC_VARIABLES],
        "sens_variables": [{"id": v, "name": n} for v, n in C.SENS_VARIABLES],
        "panel_parameters": [{"name": n, "id": v} for n, v in C.PANEL_PARAMETERS],
        "initial_cost_items": [{"key": k, "id": i, "name": n} for k, i, n in C.INITIAL_COST_ITEMS],
        "recurring_cost_items": [{"key": k, "id": i, "name": n} for k, i, n in C.RECURRING_COST_ITEMS],
        "mon_benefit_cats": [{"key": k, "id": i, "name": n} for k, i, n in C.MON_BENEFIT_CATS],
        "mon_cost_cats": [{"key": k, "id": i, "name": n} for k, i, n in C.MON_COST_CATS],
        "mon_kpis": C.MON_KPIS,
    }


@app.get("/api/case/default")
def default_case():
    """The research benchmark case exactly as the frozen v1.5 workbook holds it."""
    return normalise(json.loads((DATA / "default_case.json").read_text()))


@app.get("/api/case/blank")
def new_case():
    return blank_case()


@app.post("/api/evaluate")
def api_evaluate(case: dict = Body(...)):
    try:
        return {"case": normalise(case), "results": evaluate(case)}
    except Exception as exc:                                   # never return a half-evaluated case
        raise HTTPException(status_code=422, detail="The case could not be evaluated: %s" % exc)


@app.post("/api/montecarlo")
def api_montecarlo(payload: dict = Body(...)):
    case = normalise(payload.get("case") or {})
    try:
        return montecarlo.run(case, payload.get("alternative"), payload.get("iterations"), payload.get("seed"))
    except montecarlo.MCInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/import/xlsx")
async def api_import(file: UploadFile = File(...)):
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="The file is larger than 25 MB.")
    try:
        return import_workbook(data)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not read this workbook: %s" % exc)


@app.post("/api/export/xlsx")
def api_export(case: dict = Body(...)):
    data = export_workbook(case)
    cid = "".join(ch for ch in str(normalise(case)["meta"]["case_id"] or "case") if ch.isalnum() or ch in "-_") or "case"
    return Response(content=data,
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": 'attachment; filename="AIDSM_%s.xlsx"' % cid})


# Serve the built React app (npm run build) from the same server, so one command runs everything.
if FRONTEND.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        target = FRONTEND / path
        if path and target.is_file():
            return FileResponse(target)
        return FileResponse(FRONTEND / "index.html")
