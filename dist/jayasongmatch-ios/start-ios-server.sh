#!/bin/sh
# Start the server for iPhone and iPad use, then open the network address it
# prints on the device. See README.md for the one-time certificate setup.
cd "$(dirname "$0")" || exit 1
exec python3 serve.py --https "$@"
