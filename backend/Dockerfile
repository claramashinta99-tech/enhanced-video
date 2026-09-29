FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl git gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

RUN git clone --depth 1 --branch 2.0.0 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /opt/bgutil \
    && cd /opt/bgutil/server \
    && npm ci \
    && npx tsc

COPY app.py mp3_app.py audio_chunked_app.py diagnostic_app.py shorts_app.py youtube_engine_app.py tiktok_engine_app.py tiktok_hd_app.py social_downloaders_app.py media_inspector_app.py carousel_routes.py ./

EXPOSE 10000
CMD ["sh", "-c", "node /opt/bgutil/server/build/main.js --host 127.0.0.1 --port 4416 >/tmp/bgutil.log 2>&1 & exec uvicorn media_inspector_app:app --host 0.0.0.0 --port ${PORT:-10000}"]
