import asyncio
import logging
import os
from contextlib import suppress

import uvicorn

from bot import main as bot_main
from config import DB_PATH
from database import Database
from server import app as fastapi_app

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-8s %(name)s | %(message)s")
log = logging.getLogger("swagging_gift.run")


async def run_bot_forever() -> None:
    retry_delay = 5
    while True:
        try:
            log.info("Starting Telegram bot worker")
            await bot_main()
            log.warning("Bot polling stopped unexpectedly, restarting in %s seconds", retry_delay)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Bot worker crashed, retrying in %s seconds", retry_delay)
        await asyncio.sleep(retry_delay)


async def main() -> None:
    port = int(os.environ.get("PORT", 8000))
    await Database(DB_PATH).setup()

    config = uvicorn.Config(
        fastapi_app,
        host="0.0.0.0",
        port=port,
        log_level="info",
        timeout_keep_alive=30,
        proxy_headers=True,
    )
    server = uvicorn.Server(config)

    log.info("Starting Swagging Gift web server on 0.0.0.0:%s", port)

    bot_task = asyncio.create_task(run_bot_forever(), name="telegram-bot")
    try:
        await server.serve()
    finally:
        bot_task.cancel()
        with suppress(asyncio.CancelledError):
            await bot_task


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Interrupted by user, shutting down")
