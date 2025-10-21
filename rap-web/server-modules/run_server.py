import uvicorn
import sys
import os
import socket

def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

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
        app_str = "server.main:app"
        logging.info(f"Attempting to run uvicorn with app: {app_str}")

        port = find_free_port() # Dynamically find a free port
        logging.info(f"Found free port: {port}")

        # Print the port to stdout in a recognizable format for the Tauri app
        print(f"PORT_READY:{port}", flush=True)

        uvicorn.run(
            app_str,
            host="127.0.0.1",
            port=port, # Use the dynamically found port
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
