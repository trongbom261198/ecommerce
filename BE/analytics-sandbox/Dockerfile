FROM python:3.11-slim

# Minimal deps — no shell tools, no curl, no wget
RUN pip install --no-cache-dir pandas==2.2.3 numpy==2.1.2 pyarrow==17.0.0

# Non-root user
RUN useradd -m -u 1000 sandbox
USER sandbox

WORKDIR /app
COPY runner.py .

ENTRYPOINT ["python", "runner.py"]
