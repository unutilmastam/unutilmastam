FROM python:3.12-slim

# Fail fast, no .pyc clutter, unbuffered logs so `docker logs` is live.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first so code edits do not invalidate the wheel cache layer.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY tools/ ./tools/
COPY tests/ ./tests/
COPY run.py pytest.ini ./

# Writable locations for the SQLite file and the rotating log.
RUN mkdir -p /app/data /app/logs

# Run as a non-root user.
RUN useradd --create-home --uid 10001 bot && chown -R bot:bot /app
USER bot

ENV DATABASE_URL=sqlite+aiosqlite:///./data/signals.db \
    LOG_FILE=logs/bot.log \
    API_HOST=0.0.0.0 \
    API_PORT=8000 \
    PAPER_TRADING=true \
    REAL_TRADING=false

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD python -c "import urllib.request,sys; \
sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"

CMD ["python", "run.py"]
