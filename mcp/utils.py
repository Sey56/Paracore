"""Shared utilities for Paracore MCP servers and agent."""
import re
import grpc


def format_grpc_error(e: grpc.RpcError) -> str:
    """Formats a gRPC error into a user-friendly message."""
    details = e.details()
    if "failed to connect to all addresses" in details or "10061" in details:
        return (
            "Failed to connect to Paracore server. Ensure Revit is open and the "
            "server is toggled ON. If connection persists after refreshing, try "
            "restarting the Paracore app."
        )
    return f"Error: {details}"


def redact_secrets(text: str) -> str:
    """Redacts sensitive information like API keys from text."""
    if not text:
        return text
    redacted = re.sub(r'AIza[a-zA-Z0-9_-]{35}', '[REDACTED_API_KEY]', text)
    redacted = re.sub(r'key=[a-zA-Z0-9_-]{10,}', 'key=[REDACTED]', redacted)
    return redacted
