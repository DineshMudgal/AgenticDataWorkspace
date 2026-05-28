import re

with open("backend/agents/graph.py", "r") as f:
    content = f.read()

# Find any occurrence of `"level": "..."` and replace with `"timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"), "level": "..."`
# But only if it doesn't already have timestamp.
content = re.sub(r'(\s*)"level":\s*("[A-Z]+")', r'\1"timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"),\1"level": \2', content)

# But wait, in make_log we already handle it!
# For the multi-line dicts:
content = re.sub(r'\{\s*"level"', '{"timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"), "level"', content)

with open("backend/agents/graph.py", "w") as f:
    f.write(content)
