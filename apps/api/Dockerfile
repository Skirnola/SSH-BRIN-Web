FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 10001 brin \
    && useradd --system --uid 10001 --gid brin --home-dir /app brin

COPY requirements.txt ./
RUN python -m pip install --upgrade pip setuptools \
    && python -m pip install -r requirements.txt \
    && python -m pip check \
    && rm -rf /usr/local/lib/python3.12/ensurepip \
        /usr/local/lib/python3.12/site-packages/pip \
        /usr/local/lib/python3.12/site-packages/pip-* \
        /usr/local/lib/python3.12/site-packages/setuptools \
        /usr/local/lib/python3.12/site-packages/setuptools-* \
        /usr/local/bin/pip /usr/local/bin/pip3 /usr/local/bin/pip3.12

COPY --chown=brin:brin app ./app
RUN mkdir -p /app/.cache && chown brin:brin /app/.cache

USER brin
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=3)" || exit 1

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
