import re

with open("backend/agents/graph.py", "r") as f:
    content = f.read()

# Add import datetime if not there
if "import datetime" not in content[:500]:
    content = content.replace("import os", "import os\nimport datetime\n\ndef make_log(level, message, agent_name):\n    return {\"timestamp\": datetime.datetime.now(datetime.timezone.utc).strftime(\"%H:%M:%S\"), \"level\": level, \"message\": message, \"agent_name\": agent_name}\n", 1)

# Pattern: {"level": "...", "message": "...", "agent_name": "..."}
# We can use regex to replace all inline log dicts.
# Example: {"level": "INFO", "message": f"Identified required skills from workspace.", "agent_name": agent_name}
pattern = r'\{"level":\s*("[^"]+"),\s*"message":\s*(f?"[^"]+"|[^,]+),\s*"agent_name":\s*([^}]+)\}'
content = re.sub(pattern, r'make_log(\1, \2, \3)', content)

# Special cases where message is f"" or complex
pattern2 = r'\{"level":\s*("[^"]+"),\s*"message":\s*(f"[^"]+"),\s*"agent_name":\s*([^}]+)\}'
content = re.sub(pattern2, r'make_log(\1, \2, \3)', content)

# One for error
# {"level": "ERROR", "message": f"Graph execution failed: {e}", "agent_name": "Supervisor"}
# The above regex handles it.

with open("backend/agents/graph.py", "w") as f:
    f.write(content)
