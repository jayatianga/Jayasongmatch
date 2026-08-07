#!/usr/bin/env python3
"""Local server for Jayasongmatch.

The app needs a secure context for microphone access and correct MIME types for
ES modules and the AudioWorklet. http://localhost counts as secure, so serving
the folder from here is all that is required — nothing is uploaded anywhere.
"""

from __future__ import annotations

import argparse
import http.server
import socketserver
import sys
import threading
import webbrowser
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent

EXTRA_TYPES = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".wav": "audio/wav",
    ".svg": "image/svg+xml",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **EXTRA_TYPES}

    def end_headers(self) -> None:
        # Practising means editing and reloading; never serve a stale module.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        if "404" in (fmt % args):
            sys.stderr.write("  missing: %s\n" % (fmt % args))


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve the Jayasongmatch app on localhost.")
    parser.add_argument("--port", type=int, default=8770, help="port to listen on (default: 8770)")
    parser.add_argument("--no-browser", action="store_true", help="do not open a browser window")
    args = parser.parse_args()

    handler = partial(Handler, directory=str(ROOT))
    port = args.port
    for attempt in range(20):
        try:
            server = Server(("127.0.0.1", port), handler)
            break
        except OSError:
            port += 1
    else:
        print(f"Could not bind a port in {args.port}-{port}.", file=sys.stderr)
        return 1

    url = f"http://localhost:{port}/"
    print("Jayasongmatch is running.")
    print(f"  {url}")
    print("Use Chrome or Edge, allow microphone access, and wear headphones.")
    print("Press Ctrl+C to stop.")

    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
