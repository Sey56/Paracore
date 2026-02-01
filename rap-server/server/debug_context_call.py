import os
import sys

# Add the server directory to sys.path so we can import grpc_client
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

try:
    from grpc_client import get_context
    print("Attempting to call get_context()...")
    result = get_context()
    print("SUCCESS: get_context() returned:")
    print(result)
except Exception as e:
    print("FAILURE: get_context() raised an exception:")
    print(e)
    import traceback
    traceback.print_exc()
