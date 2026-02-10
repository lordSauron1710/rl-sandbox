FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Build/runtime libs for Gymnasium + Box2D + video encoding.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    swig \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
  && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY backend/app ./app

RUN useradd --create-home --uid 10001 appuser && \
    mkdir -p /data/runs && \
    chown -R appuser:appuser /app /data

ENV HOST=0.0.0.0 \
    PORT=8000 \
    RLV_DB_PATH=/data/rl_visualizer.db \
    RLV_RUNS_DIR=/data/runs \
    SDL_VIDEODRIVER=dummy \
    SDL_AUDIODRIVER=dummy

EXPOSE 8000

USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
