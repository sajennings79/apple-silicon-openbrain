"""Minimal embedding server using MLX for Qwen3-0.6B embeddings."""

from contextlib import asynccontextmanager

import mlx.core as mx
from fastapi import FastAPI
from pydantic import BaseModel

MODEL_NAME = "mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ"

model = None
tokenizer = None


def load_model():
    global model, tokenizer
    from mlx_lm import load

    model, tokenizer = load(MODEL_NAME)


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a list of texts using MLX."""
    all_embeddings = []
    for text in texts:
        tokens = tokenizer.encode(text, return_tensors=None)
        input_ids = mx.array([tokens])
        hidden = model.model(input_ids)
        # Mean pooling over sequence length
        embedding = mx.mean(hidden, axis=1).squeeze()
        embedding = embedding / mx.linalg.norm(embedding)
        all_embeddings.append(embedding.tolist())
    return all_embeddings


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_model()
    yield


app = FastAPI(title="OpenBrain Embeddings", lifespan=lifespan)


class EmbeddingRequest(BaseModel):
    input: str | list[str]
    model: str = MODEL_NAME


@app.post("/v1/embeddings")
async def create_embeddings(request: EmbeddingRequest):
    texts = [request.input] if isinstance(request.input, str) else request.input
    embeddings = embed_texts(texts)
    return {
        "object": "list",
        "model": request.model,
        "data": [
            {"object": "embedding", "index": i, "embedding": emb}
            for i, emb in enumerate(embeddings)
        ],
        "usage": {"prompt_tokens": 0, "total_tokens": 0},
    }


@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL_NAME}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=6278)
