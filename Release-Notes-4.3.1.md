# Paracore 4.3.1 (Connection Stability Patch)

Version 4.3.1 improves the reliability of the background server connections introduced in 4.3.0.

## 1. Flawless Ribbon Toggling
Fixed a bug where rapidly toggling the Paracore Server on and off in the Revit ribbon could occasionally cause the background process to get stuck and fail to reconnect. We replaced the abrupt server shutdown with a graceful teardown system, ensuring the server perfectly resets itself every time you click the toggle.

## 2. Instant Reconnections
Eliminated a timeout issue that could cause the desktop app to wait upward of two minutes before realizing the server was back online. By adjusting the internal connection timers, the desktop app now snaps back to "Connected" the millisecond you re-enable the server in Revit.
