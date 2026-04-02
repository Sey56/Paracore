# Paracore 4.3.1 (Sidecar Stability Patch)

Version 4.3.1 acts as a crucial stabilization patch for the major architectural overhaul introduced in 4.3.0. It ensures robust connection handling, zero-latency reconnection, and perfect lifecycle management for the new Paracore.Server sidecar.

## 1. Graceful Sidecar Teardown & Port Management
Previously, manually toggling the connection off or closing Revit could cause the sidecar to terminate abruptly, occasionally leaving its localhost HTTP/2 port hanging in a `TIME_WAIT` state. This blocked the sidecar from cleanly rebooting, causing subsequent connections to fail. We entirely overhauled the teardown lifecycle by introducing an invisible STDIN bridge. Clicking the Ribbon toggle now sends a gentle exit signal, instructing the Sidecar to execute an `IHostApplicationLifetime.StopApplication()`. This cleans up all active network frames and unbinds the port perfectly every time, preventing phantom processes.

## 2. Aggressive gRPC Backend Reconnection
Due to the strict exponential backoff algorithm native to the gRPC specification, leaving the sidecar toggled off for a few minutes would cause the desktop app's internal reconnect timer to maximize at 120 seconds. This artificially delayed the connection when the user flipped the sidecar back on. We implemented surgical limits into the Python endpoint (`grpc.max_reconnect_backoff_ms`), capping the delay at 2 seconds. Furthermore, the Python proxy now aggressively destroys and rebuilds its communication channel whenever it encounters a phantom connection state. This guarantees an instant, snappy reconnection regardless of how much time has passed.
