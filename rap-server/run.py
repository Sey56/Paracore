import multiprocessing
import sys
import os
import uvicorn

# This is the entry point for the PyInstaller bundled executable.

# --- Python Path Setup ---
# When packaged with PyInstaller, the executable runs from a temporary directory
# referred to by sys._MEIPASS. We need to add this directory to the Python path
# to ensure that our bundled 'server' module can be found.
if getattr(sys, 'frozen', False):
    # We are running in a bundle
    application_path = sys._MEIPASS
    sys.path.insert(0, application_path)
else:
    # We are running in a normal Python environment
    application_path = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, application_path)

# --- App Import ---
# With the path correctly set, we can now import the FastAPI app instance.
# If this line fails, it's a clear indication the 'server' module or its
# dependencies were not bundled correctly.
try:
    from server.main import app
except ImportError as e:
    # In case of an error, write it to a log file for debugging
    with open("rap_server_error.log", "w") as f:
        f.write(f"Failed to import 'app' from 'server.main'.\n")
        f.write(f"Python Path: {sys.path}\n")
        f.write(f"Error: {e}\n")
    sys.exit(1) # Exit if we can't import the app

# --- Stream Redirection ---
# In a windowed executable (no console), stdout/stderr might not exist.
# This can crash logging. We redirect them to devnull if they are missing.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

# --- Logging Configuration ---
# A basic logging config for uvicorn that doesn't use colors, suitable for
# file or event log output.
LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "()": "uvicorn.logging.DefaultFormatter",
            "fmt": "% (levelprefix)s %(message)s",
            "use_colors": False,
        },
        "access": {
            "()": "uvicorn.logging.AccessFormatter",
            "fmt": '%(levelprefix)s %(client_addr)s - "%(request_line)s" %(status_code)s',
            "use_colors": False,
        },
    },
    "handlers": {
        "default": {
            "formatter": "default",
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stderr",
        },
        "access": {
            "formatter": "access",
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout",
        },
    },
    "loggers": {
        "uvicorn": {"handlers": ["default"], "level": "INFO"},
        "uvicorn.error": {"level": "INFO"},
        "uvicorn.access": {"handlers": ["access"], "level": "INFO", "propagate": False},
    },
}

# --- Main Execution Block ---
if __name__ == '__main__':
    # PyInstaller requires this for multiprocessing support on Windows
    multiprocessing.freeze_support()

    # Run the server with the directly imported 'app' object
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        log_config=LOGGING_CONFIG
    )