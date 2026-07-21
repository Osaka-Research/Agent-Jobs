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

EXPOSE 8000

# single worker — jobspy is serial per-call; concurrency happens at the request layer
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--log-level", "info"]
