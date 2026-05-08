FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl openssl nodejs npm \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g prisma@6.1.0

COPY apps/api/pyproject.toml /app/apps/api/pyproject.toml
WORKDIR /app/apps/api
RUN pip install --no-cache-dir -e .

COPY packages/db /app/packages/db
RUN prisma generate --schema /app/packages/db/prisma/schema.prisma

COPY apps/api /app/apps/api

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
