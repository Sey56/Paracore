import logging
import threading
from collections import defaultdict

# Assuming the generated protobuf files are in the same directory or accessible
import corescript_pb2
import corescript_pb2_grpc

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# A thread-safe, in-memory cache for the canonical working set state from Revit.
# The agent's state will be synchronized from this cache.
# Structure: {"CategoryName": {element_id_1, element_id_2, ...}}
CANONICAL_WORKING_SET = defaultdict(set)
_lock = threading.Lock()

class RServerListenerServicer(corescript_pb2_grpc.RServerListenerServicer):
    """
    Implements the gRPC service for receiving notifications from the RServer.Addin.
    """
    def NotifyWorkingSetChanged(self, request, context):
        """
        Handles updates to the working set sent from Revit.
        """
        logger.info("Received NotifyWorkingSetChanged request from RServer.Addin")

        with _lock:
            # Process additions and modifications
            for addition in request.additions:
                category = addition.category
                ids_to_add = set(addition.element_ids)

                if not category:
                    logger.warning("Received an addition with an empty category.")
                    continue

                CANONICAL_WORKING_SET[category].update(ids_to_add)
                logger.info(f"Added/Updated {len(ids_to_add)} elements in category '{category}'")

            # Process deletions
            if request.deleted_ids:
                ids_to_delete = set(request.deleted_ids)
                categories_to_clean = []

                for category, id_set in CANONICAL_WORKING_SET.items():
                    id_set.difference_update(ids_to_delete)
                    # If a category becomes empty, mark it for removal
                    if not id_set:
                        categories_to_clean.append(category)

                # Remove empty categories from the working set
                for category in categories_to_clean:
                    del CANONICAL_WORKING_SET[category]

                logger.info(f"Removed {len(ids_to_delete)} elements from the working set.")

        # logger.debug(f"Current Canonical Working Set: {dict(CANONICAL_WORKING_SET)}")
        return corescript_pb2.Empty()

def get_canonical_working_set() -> dict:
    """
    Provides a thread-safe way to get a copy of the current working set.
    The agent will call this to synchronize its state.
    """
    with _lock:
        # Return a copy to prevent mutation outside of the lock
        return {category: list(ids) for category, ids in CANONICAL_WORKING_SET.items()}
