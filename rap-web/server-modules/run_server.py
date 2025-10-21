import uvicorn
import sys
import os

def run_server():
    """
    Starts the Uvicorn server for the FastAPI application.
    This function is designed to be called from an embedded Python environment (e.g., via PyO3).
    """
    try:
        import logging.config
        import logging
        import traceback

        # --- Add the script's directory to Python's path ---
        # This is the most robust way to ensure that modules (like the 'server' package)
        # can be found, regardless of the current working directory set by the caller (Tauri).
        script_dir = os.path.dirname(os.path.abspath(__file__))
        if script_dir not in sys.path:
            sys.path.insert(0, script_dir)

        # --- Setup Application Directories ---
        log_dir = os.path.join(os.getenv('APPDATA'), 'rap-data', 'logs')
        if not os.path.exists(log_dir):
            os.makedirs(log_dir)

        log_file_path = os.path.join(log_dir, "server.log")

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
            # Define loggers for specific parts of the application.
            "loggers": {
                # Capture logs from the uvicorn server.
                "uvicorn": {"handlers": ["file"], "level": "INFO", "propagate": False},
                # Capture logs from your own application code (e.g., from the 'server' package).
                "server": {"handlers": ["file"], "level": "INFO", "propagate": False},
            },
            "root": {"handlers": ["file"], "level": "INFO"},
        }

        data_dir = os.path.join(os.getenv('APPDATA'), 'rap-data', 'data')
        if not os.path.exists(data_dir):
            os.makedirs(data_dir)
        os.environ['RAP_DATABASE_PATH'] = os.path.join(data_dir, 'rap_local.db')

        # Apply the custom logging configuration
        logging.config.dictConfig(
            log_config
        )

        # --- Log Environment Details for Debugging ---
        logging.info("--- Starting Python Server ---")
        logging.info(f"Current working directory: {os.getcwd()}")
        logging.info(f"Python sys.path: {sys.path}")
        logging.info(f"RAP_DATABASE_PATH: {os.environ.get('RAP_DATABASE_PATH')}")

        # --- Start Uvicorn Server ---
        # By passing the app as a string 'package.module:variable', we let uvicorn
        # handle the import, which is more robust and mirrors the command-line behavior.
        # This is the correct way to reference your app from this script's location.
        app_str = "server.main:app"
        logging.info(f"Attempting to run uvicorn with app: {app_str}")
        uvicorn.run(
            app_str,
            host="127.0.0.1",
            port=8000,
            log_config=log_config # Use our custom logging config
        )
        
    except Exception as e:
        # Fallback error logging in case the main setup fails.
        # Try to log to the intended file, but also print to stderr as a last resort.
        error_message = f"FATAL STARTUP ERROR in run_server.py: {e}\n{traceback.format_exc()}"
        try:
            # This will work if basicConfig was successful
            logging.critical(error_message)
        except Exception:
            # This will write to the original stderr if logging setup failed
            print(error_message, file=sys.stderr)

if __name__ == "__main__":
    # This block allows the script to be run directly for local testing,
    # e.g., `python run_server.py` from the `rap-server` directory
    run_server()
