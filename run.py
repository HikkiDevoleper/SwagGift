import asyncio
import os
import uvicorn
import logging
from bot import main as bot_main
from server import app as fastapi_app

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("swagging_gift.run")

async def main():
    port = int(os.environ.get("PORT", 8000))
    
    # Configure and run FastAPI server
    config = uvicorn.Config(fastapi_app, host="0.0.0.0", port=port, log_level="info")
    server = uvicorn.Server(config)
    
    # Run both bot and server concurrently
    # Bot and Server both use the same db object effectively
    log.info(f"Starting Swagging Gift on port {port}...")
    
    await asyncio.gather(
        server.serve(),
        bot_main()
    )

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Interrupted by user, shutting down.")
