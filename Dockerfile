# Use an official Python runtime as a parent image
FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./

RUN uv sync --no-dev --all-extras


COPY . .
EXPOSE 3131

CMD [".venv/bin/uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3131"]