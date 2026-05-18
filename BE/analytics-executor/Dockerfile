FROM python:3.12-slim

# Install R, system deps, and R packages via apt (faster + no CRAN network dependency)
RUN apt-get update && apt-get install -y --no-install-recommends \
    r-base \
    r-cran-jsonlite \
    r-cran-dplyr \
    curl \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Pre-install DuckDB extensions (avoids runtime network calls)
RUN python3 -c "import duckdb; c=duckdb.connect(); c.execute('INSTALL httpfs; INSTALL postgres;'); c.close()" || true

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
