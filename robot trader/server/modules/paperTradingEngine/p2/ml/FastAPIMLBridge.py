"""
FastAPI ML Bridge for P2 — receives PPO/TCN signals and forwards to Node.js engine
Run with: uvicorn FastAPIMLBridge:app --port 8001
"""
from fastapi import FastAPI
from pydantic import BaseModel
import httpx
import os
from typing import Literal

# Node analysis service base URL. Override with NODE_SERVICE_URL in
# containerized deployments (e.g. http://analysis-service:3000).
NODE_SERVICE_URL = os.getenv("NODE_SERVICE_URL", "http://localhost:3000")

app = FastAPI(title="P2 ML Signal Bridge")

class MLSignal(BaseModel):
    action: Literal["BUY", "SELL", "HOLD"]
    confidence: float
    regime: str = "RANGING"

class ExecuteRequest(BaseModel):
    signal: MLSignal
    symbol: str
    market_price: float
    size: float = 1.0

@app.post("/execute-ml-signal")
async def execute_ml_signal(req: ExecuteRequest):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{NODE_SERVICE_URL}/api/paper-trading/p2/execute-ml",
            json={
                "signal": req.signal.model_dump(),
                "symbol": req.symbol,
                "marketPrice": req.market_price,
                "size": req.size
            },
            timeout=5.0
        )
        return response.json()
