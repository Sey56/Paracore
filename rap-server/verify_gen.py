import sys
import os

# Add the server directory to sys.path
sys.path.append(r'C:\Users\seyou\Paracore\rap-server\server')

from services.query_to_watchdog import generate_watchdog_script_content
import asyncio
import json

async def test():
    root_group = {
        "type": "group",
        "combinator": "AND",
        "children": [
            {
                "type": "rule",
                "name": "Area",
                "storage_type": "Double",
                "operator": ">",
                "value": "100"
            }
        ]
    }
    
    content = await generate_watchdog_script_content(
        name="Test Sentinel",
        description="A test sentinel",
        category_name="OST_Walls",
        root_group=root_group
    )
    
    print("-" * 40)
    print("GENERATED CONTENT PREVIEW:")
    print("-" * 40)
    print(content)
    print("-" * 40)

if __name__ == "__main__":
    asyncio.run(test())
