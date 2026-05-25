import logging
from logging.handlers import RotatingFileHandler

from config import settings


LOG_FORMAT = "%(asctime)s | %(levelname)s | %(module)s | %(message)s"


def configure_logging() -> logging.Logger:
    settings.log_dir.mkdir(parents=True, exist_ok=True)
    log_file = settings.log_dir / "voxassess.log"

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    if not root_logger.handlers:
        formatter = logging.Formatter(LOG_FORMAT)

        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        root_logger.addHandler(console_handler)

        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=10 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)

    return logging.getLogger("voxassess")


logger = configure_logging()
