#!/bin/sh
# Double-click this file in Finder to start Jayasongmatch.
cd "$(dirname "$0")" || exit 1

if command -v python3 >/dev/null 2>&1; then
  exec python3 serve.py "$@"
fi

cat <<'MESSAGE'

Python 3 was not found.

macOS does not always include it. Either:
  xcode-select --install          (installs Apple's command line tools)
or install it from https://www.python.org/downloads/macos/

Then double-click this file again.

MESSAGE
read -r _ 2>/dev/null
exit 1
