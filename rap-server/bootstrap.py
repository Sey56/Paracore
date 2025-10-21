# c:\Users\seyou\RAP\rap-server\bootstrap.py
import run_server
import sys
import os
import traceback

if __name__ == "__main__":
    try:
        # This is the single entry point for the application.
        # It will correctly initialize the bundled environment and then call
        # your existing server logic.
        run_server.run_server()
    except Exception as e:
        # This is a critical fallback. If run_server() fails for any reason,
        # this will catch the exception and log it to a file in a known location.
        # This ensures you ALWAYS get a log file, even if the main logging setup fails.
        log_dir = os.path.join(os.getenv('APPDATA'), 'rap-data', 'logs')
        if not os.path.exists(log_dir):
            os.makedirs(log_dir)
        
        error_log_path = os.path.join(log_dir, "bootstrap_error.log")
        with open(error_log_path, "a") as f:
            f.write(f"--- FATAL BOOTSTRAP ERROR ---\n")
            f.write(f"Timestamp: {__import__('datetime').datetime.now()}\n")
            f.write(f"Error: {e}\n")
            f.write(traceback.format_exc())
            f.write("\n")
        
        # Also print to stderr, which might be captured by Tauri's logs.
        print(f"FATAL BOOTSTRAP ERROR: {e}\n{traceback.format_exc()}", file=sys.stderr)