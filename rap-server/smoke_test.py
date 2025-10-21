import sys
import time

def run_test():
    # This is the simplest possible test. It only prints to the console.
    # If this text does not appear, there is a fundamental problem with the Python environment itself.
    print("--- Smoke Test Starting ---")
    print("Hello from stdout!")
    sys.stdout.flush() # Force output to appear immediately
    print("Hello from stderr!", file=sys.stderr)
    sys.stderr.flush() # Force output to appear immediately
    print("--- Smoke Test Finished. This window will stay open. ---")

if __name__ == "__main__":
    run_test()