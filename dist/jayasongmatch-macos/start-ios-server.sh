#!/bin/sh
# Serve over https so an iPhone or iPad on the same Wi-Fi can use the
# microphone. See README.md for the one-time certificate setup on the device.
cd "$(dirname "$0")" || exit 1
exec python3 serve.py --https "$@"
