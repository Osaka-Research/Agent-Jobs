FROM python:3.12-slim

# jobspy scrapes sites that don't always play nice with default user-agent; build tools not needed at runtime
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# install deps first for layer caching
COPY requirements.txt .
RUN pip install -r requirements.txt

# copy app
COPY app/ ./app/

EXPOSE 10000

# Render sets $PORT (default 10000) and publishes that port to the public URL.
# Hardcoding 8000 here broke the first deploy — health check on /api/health
# hit the wrong port. Use $PORT so it tracks whatever Render assigns.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1 --log-level info"]
