import uvicorn
import argparse
import os
from api.main import app

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the FastAPI server")
    parser.add_argument(
        "--port", type=int, required=True, help="Port number to run the server on"
    )
    parser.add_argument(
        "--reload", type=str, default="false", help="Reload the server on code changes"
    )
    args = parser.parse_args()
    reload = args.reload == "true"
    host = "127.0.0.1"

    # Bind asset/base URL generation to the active runtime port (same env name as Next/Electron).
    os.environ["NEXT_PUBLIC_FAST_API"] = f"http://{host}:{args.port}"
    
    uvicorn.run(
        "api.main:app",
        host=host,
        port=args.port,
        log_level="info",
        reload=reload,
    )