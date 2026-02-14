.PHONY: setup install run test clean

setup:
	uv venv
	uv pip install -r requirements.txt

install:
	uv pip install -r requirements.txt

run:
	uv run uvicorn app.main:app --port 8000

test:
	uv run pytest tests/ -v

clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
