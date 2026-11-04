"""Write the API's OpenAPI document for packages/api-types (sorted, stable).

    uv run python scripts/export_openapi.py ../../packages/api-types/openapi.json

Creating the app opens no connections, so dummy URLs are enough in CI.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from app.config import Settings
from app.main import create_app


def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("openapi.json")
    settings = Settings.model_validate(
        {
            "APP_ENV": "development",
            "DATABASE_URL": "postgresql+psycopg://u:p@127.0.0.1:1/x",
            "REDIS_URL": "redis://127.0.0.1:1/0",
            "APP_SECRET_KEY": "openapi-export-only-not-a-secret-0000",
            "STORAGE_BACKEND": "memory",
        }
    )
    schema = create_app(settings, configure_logs=False).openapi()
    target.write_text(json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {target} ({len(schema['paths'])} paths)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
