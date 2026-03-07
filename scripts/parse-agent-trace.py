#!/usr/bin/env python3
"""Parse a Convex Agent thread JSON dump into a readable tool-call trace.

Usage:
    python3 scripts/parse-agent-trace.py /tmp/thread.json
"""
import json, sys

if len(sys.argv) < 2:
    print("Usage: parse-agent-trace.py <thread.json>", file=sys.stderr)
    sys.exit(1)

with open(sys.argv[1]) as f:
    data = json.load(f)

for i, msg in enumerate(data.get("page", [])):
    message = msg.get("message", {})
    role = message.get("role", "?")
    content = message.get("content", "")

    if isinstance(content, list):
        for part in content:
            if part.get("type") == "tool-call":
                args = part.get("args", {})
                name = part.get("toolName", "")
                cmd = args.get("command", "")[:400] if name == "bash" else json.dumps(args)[:400]
                print(f"msg[{i}] [{role}] {name}: {cmd}")
            elif part.get("type") == "tool-result":
                out = part.get("output", {})
                val = out.get("value", {}) if isinstance(out, dict) else out
                if isinstance(val, dict):
                    output = str(val.get("output", val.get("error", "")))[:600]
                    print(f"  => exit={val.get('exitCode', '?')} success={val.get('success', '?')} output={output}")
                else:
                    print(f"  => {str(val)[:600]}")
            elif part.get("type") == "text":
                txt = part.get("text", "")[:500]
                if txt.strip():
                    print(f"msg[{i}] [{role}] text: {txt}")

    text = msg.get("text", "")
    if text:
        print(f"msg[{i}] [{role}] TEXT: {text[:400]}")
    if isinstance(content, str) and content:
        print(f"msg[{i}] [{role}] CONTENT: {content[:500]}")

    print()
