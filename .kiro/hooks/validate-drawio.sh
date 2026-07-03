#!/bin/bash
# Validate .drawio XML after write (CLI equivalent of validate-drawio-*.kiro.hook)
# Reads hook event JSON from STDIN, checks if file is .drawio, validates common errors

EVENT=$(cat)
FILE=$(echo "$EVENT" | jq -r '.tool_input.path // empty')

# Only process .drawio files
if [[ "$FILE" != *.drawio ]]; then exit 0; fi
if [ ! -f "$FILE" ]; then exit 0; fi

ERRORS=""

# Check self-closing edges (edge="1" ... />)
if grep -P 'edge="1"[^>]*/>' "$FILE" >/dev/null 2>&1; then
  ERRORS="${ERRORS}Self-closing edge found (missing mxGeometry child). "
fi

# Check mxfile wrapper
if head -1 "$FILE" | grep -q '<mxfile'; then
  ERRORS="${ERRORS}Has mxfile wrapper (should be bare mxGraphModel). "
fi

if [ -n "$ERRORS" ]; then
  echo "⚠️ drawio validation: ${ERRORS}" >&2
  exit 1
fi
exit 0
