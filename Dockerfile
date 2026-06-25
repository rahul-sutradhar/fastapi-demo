# Each of them below executes layer by layer
FROM python:3.12.7

WORKDIR /usr/src/app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/

COPY requirements.txt ./

# It is the longest time taking command
RUN uv pip install --system --no-cache-dir -r requirements.txt

COPY . .

# CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]