import uvicorn
import sys
import os
import logging.config
import logging
import traceback

def run_server():
    """
    Starts the Uvicorn server for the FastAPI application.
    """
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        if script_dir not in sys.path:
            sys.path.insert(0, script_dir)

        # --- Setup Application Directories ---
        log_dir = os.path.join(os.getenv('APPDATA'), 'paracore-data', 'logs')
        if not os.path.exists(log_dir):
            os.makedirs(log_dir)

        log_file_path = os.path.join(log_dir, "paracore_server.log")

        log_config = {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "default": {
                    "format": "%(asctime)s - %(levelname)s - %(message)s",
                },
            },
            "handlers": {
                "file": {
                    "class": "logging.FileHandler",
                    "filename": log_file_path,
                    "formatter": "default",
                    "mode": "a",
                }
            },
            "root": {"handlers": ["file"], "level": "INFO"},
        }

        data_dir = os.path.join(os.getenv('APPDATA'), 'paracore-data', 'data')
        if not os.path.exists(data_dir):
            os.makedirs(data_dir)
        os.environ['RAP_DATABASE_PATH'] = os.path.join(data_dir, 'paracore_local.db')

        logging.config.dictConfig(log_config)
        logging.info("--- Starting Python Server ---")

        # --- Start Uvicorn Server ---
        app_str = "server.main:app"
        port = 8000  # Hardcode the port to 8000
        uvicorn.run(
            app_str,
            host="127.0.0.1",
            port=port,
            log_config=log_config
        )
    except Exception as e:
        error_message = f"FATAL STARTUP ERROR in run_server.py: {e}\n{traceback.format_exc()}"
        try:
            logging.critical(error_message)
        except Exception:
            print(error_message, file=sys.stderr)

if __name__ == "__main__":
    # This block allows the script to be run directly for local testing,
    # e.g., `python run_server.py` from the `rap-server` directory
    run_server()
