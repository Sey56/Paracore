import json
import os
import sys

# Add the server directory to sys.path
sys.path.append(os.path.abspath("c:/Users/seyou/RAP/rap-server/server"))

from agent.nodes.working_set_utils import process_working_set_output


def test_working_set_utils():
    print("Testing working_set_utils...")

    # Test 1: Add elements by category
    current_set = {}
    payload = json.dumps({
        "paracore_output_type": "working_set_elements",
        "operation": "add",
        "elements_by_category": {"Walls": [101, 102], "Doors": [201]}
    })
    output_str = f"Some log output... {payload}"
    new_set, msg = process_working_set_output(output_str, current_set)
    print(f"Test 1 (Add Categories): {new_set}")
    assert new_set == {"Walls": [101, 102], "Doors": [201]}

    # Test 2: Add more elements to existing category
    current_set = {"Walls": [101, 102], "Doors": [201]}
    payload = json.dumps({
        "paracore_output_type": "working_set_elements",
        "operation": "add",
        "elements_by_category": {"Walls": [103]}
    })
    output_str = f"{payload}"
    new_set, msg = process_working_set_output(output_str, current_set)
    print(f"Test 2 (Append Category): {new_set}")
    assert set(new_set["Walls"]) == {101, 102, 103}
    assert new_set["Doors"] == [201]

    # Test 3: Legacy add (should go to Unknown)
    current_set = {"Walls": [101]}
    payload = json.dumps({
        "paracore_output_type": "working_set_elements",
        "operation": "add",
        "element_ids": [999]
    })
    output_str = f"{payload}"
    new_set, msg = process_working_set_output(output_str, current_set)
    print(f"Test 3 (Legacy Add): {new_set}")
    assert new_set["Walls"] == [101]
    assert new_set["Unknown"] == [999]

    # Test 4: Remove by category
    current_set = {"Walls": [101, 102], "Doors": [201]}
    payload = json.dumps({
        "paracore_output_type": "working_set_elements",
        "operation": "remove",
        "elements_by_category": {"Walls": [101]}
    })
    output_str = f"{payload}"
    new_set, msg = process_working_set_output(output_str, current_set)
    print(f"Test 4 (Remove Category): {new_set}")
    assert new_set["Walls"] == [102]
    assert new_set["Doors"] == [201]

    # Test 5: Remove by ID (Legacy/Tool)
    current_set = {"Walls": [101, 102], "Doors": [201]}
    payload = json.dumps({
        "paracore_output_type": "working_set_elements",
        "operation": "remove",
        "element_ids": [102, 201]
    })
    output_str = f"{payload}"
    new_set, msg = process_working_set_output(output_str, current_set)
    print(f"Test 5 (Remove IDs): {new_set}")
    assert new_set["Walls"] == [101]
    assert "Doors" not in new_set

    print("All tests passed!")

if __name__ == "__main__":
    test_working_set_utils()
