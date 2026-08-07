#!/usr/bin/env python3
"""Local server for Jayasongmatch.

Microphone access needs a secure context. On the machine running this server
plain http://localhost counts as secure, so the default is enough. Phones and
tablets reaching the app across the network do not get that exemption, so
--https generates a certificate and serves over TLS.

    python serve.py                 # this computer only
    python serve.py --https         # also usable from an iPhone or iPad

Nothing is uploaded anywhere; the server only hands out the files in this
folder.
"""

from __future__ import annotations

import argparse
import datetime
import http.server
import ipaddress
import socket
import socketserver
import ssl
import sys
import threading
import webbrowser
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CERT_DIR = ROOT / ".certs"
CERT_FILE = CERT_DIR / "jayasongmatch-cert.pem"
KEY_FILE = CERT_DIR / "jayasongmatch-key.pem"

EXTRA_TYPES = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".wav": "audio/wav",
    ".svg": "image/svg+xml",
    ".png": "image/png",
}


def lan_address() -> str | None:
    """Best guess at this machine's address on the local network."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # No packets are actually sent; this just picks the outbound interface.
        probe.connect(("8.8.8.8", 80))
        return probe.getsockname()[0]
    except OSError:
        return None
    finally:
        probe.close()


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **EXTRA_TYPES}

    def do_GET(self) -> None:  # noqa: N802 - name fixed by the base class
        # Hand the certificate over in the form iOS recognises as a profile to
        # install, which is what makes the whole thing a trusted origin.
        if self.path.split("?")[0] in ("/cert.crt", "/cert.pem"):
            if not CERT_FILE.exists():
                self.send_error(404, "No certificate; start the server with --https")
                return
            body = CERT_FILE.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/x-x509-ca-cert")
            self.send_header("Content-Disposition", 'attachment; filename="jayasongmatch.crt"')
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self) -> None:
        # Practising means editing and reloading; never serve a stale module.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        message = fmt % args
        if "404" in message:
            sys.stderr.write(f"  missing: {message}\n")


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def build_certificate(hosts: list[str]) -> bool:
    """Create a self-signed certificate covering localhost and the LAN address.

    Two ways of doing it, because neither is always available: the cryptography
    package, or the openssl command line. Whichever answers first wins.
    """
    if _build_with_cryptography(hosts):
        return True
    if _build_with_openssl(hosts):
        return True
    print(
        "\n--https could not make a certificate. Either:\n"
        "  python -m pip install cryptography\n"
        "or install OpenSSL and make sure `openssl` is on your PATH.\n"
        "Then run this again.\n",
        file=sys.stderr,
    )
    return False


def _build_with_cryptography(hosts: list[str]) -> bool:
    # A half-installed build of this package fails inside its Rust bindings and
    # raises pyo3's PanicException, which derives from BaseException rather
    # than Exception — so catching Exception here would still crash the server.
    # Anything at all going wrong just means "try the other way".
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID
    except BaseException:  # noqa: BLE001 - see above
        return False

    try:
        return _write_cryptography_cert(hosts, x509, hashes, serialization, rsa, NameOID)
    except BaseException as error:  # noqa: BLE001 - fall through to the openssl path
        print(f"  (cryptography could not build the certificate: {error})", file=sys.stderr)
        return False


def _write_cryptography_cert(hosts, x509, hashes, serialization, rsa, NameOID) -> bool:
    CERT_DIR.mkdir(exist_ok=True)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    names: list[x509.GeneralName] = []
    for host in hosts:
        try:
            names.append(x509.IPAddress(ipaddress.ip_address(host)))
        except ValueError:
            names.append(x509.DNSName(host))

    subject = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "Jayasongmatch local"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Jayasongmatch"),
    ])
    now = datetime.datetime.now(datetime.timezone.utc)
    certificate = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=825))  # iOS rejects longer
        .add_extension(x509.SubjectAlternativeName(names), critical=False)
        # Marked as a CA so iOS will let you switch on full trust for it.
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )

    KEY_FILE.write_bytes(key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ))
    CERT_FILE.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
    return True


def _build_with_openssl(hosts: list[str]) -> bool:
    """Same certificate, made by the openssl command line instead."""
    import shutil
    import subprocess

    openssl = shutil.which("openssl")
    if not openssl:
        return False

    CERT_DIR.mkdir(exist_ok=True)
    entries = []
    dns = ip = 0
    for host in hosts:
        try:
            ipaddress.ip_address(host)
            ip += 1
            entries.append(f"IP.{ip} = {host}")
        except ValueError:
            dns += 1
            entries.append(f"DNS.{dns} = {host}")

    config = CERT_DIR / "openssl.cnf"
    config.write_text(
        "[req]\n"
        "distinguished_name = dn\n"
        "x509_extensions = ext\n"
        "prompt = no\n"
        "[dn]\n"
        "CN = Jayasongmatch local\n"
        "O = Jayasongmatch\n"
        "[ext]\n"
        # CA:TRUE so iOS offers a trust switch for it.
        "basicConstraints = critical, CA:TRUE\n"
        "subjectAltName = @alt\n"
        "[alt]\n" + "\n".join(entries) + "\n",
        encoding="utf-8",
    )

    try:
        subprocess.run(
            [openssl, "req", "-x509", "-nodes", "-newkey", "rsa:2048",
             "-keyout", str(KEY_FILE), "-out", str(CERT_FILE),
             "-days", "825", "-config", str(config)],
            check=True, capture_output=True,
        )
    except (subprocess.CalledProcessError, OSError) as error:
        detail = getattr(error, "stderr", b"") or b""
        print(f"  (openssl could not build the certificate: {detail.decode(errors='replace').strip()})", file=sys.stderr)
        return False
    return True


def certificate_covers(hosts: list[str]) -> bool:
    """Is the stored certificate still valid and still covering these hosts?

    Answered without cryptography if need be, since that package may be the
    reason we fell back to openssl in the first place.
    """
    if not (CERT_FILE.exists() and KEY_FILE.exists()):
        return False
    try:
        from cryptography import x509
        certificate = x509.load_pem_x509_certificate(CERT_FILE.read_bytes())
        if certificate.not_valid_after_utc < datetime.datetime.now(datetime.timezone.utc):
            return False
        san = certificate.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        return all(host in {str(name.value) for name in san} for host in hosts)
    except BaseException:  # noqa: BLE001 - a broken build panics; fall back to openssl
        pass

    import shutil
    import subprocess

    openssl = shutil.which("openssl")
    if not openssl:
        # Cannot inspect it, so rebuild rather than serve something that may
        # not cover this machine's current address.
        return False
    try:
        result = subprocess.run(
            [openssl, "x509", "-in", str(CERT_FILE), "-noout", "-text", "-checkend", "0"],
            capture_output=True, check=False,
        )
        if result.returncode != 0:
            return False
        text = result.stdout.decode(errors="replace")
        return all((f"DNS:{host}" in text or f"IP Address:{host}" in text) for host in hosts)
    except OSError:
        return False


def print_ios_instructions(url: str, cert_url: str) -> None:
    print("\nTo use this from an iPhone or iPad on the same Wi-Fi:")
    print(f"  1. On the device, open  {cert_url}  and allow the profile to download.")
    print("  2. Settings > General > VPN & Device Management > install the profile.")
    print("  3. Settings > General > About > Certificate Trust Settings > turn it on")
    print("     for 'Jayasongmatch local'.")
    print(f"  4. Open  {url}  and allow microphone access.")
    print("  5. Share button > Add to Home Screen, for a full-screen app.")
    print("\n  Steps 1-3 are once per device. Without them Safari will not")
    print("  hand over the microphone.\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve the Jayasongmatch app locally.")
    parser.add_argument("--port", type=int, default=0, help="port to listen on (default 8770, or 8771 with --https)")
    parser.add_argument("--https", action="store_true", help="serve over TLS so phones and tablets can use the microphone")
    parser.add_argument("--host", default="0.0.0.0", help="address to bind (default: all interfaces)")
    parser.add_argument("--no-browser", action="store_true", help="do not open a browser window")
    args = parser.parse_args()

    port = args.port or (8771 if args.https else 8770)
    address = lan_address()

    context = None
    if args.https:
        hosts = ["localhost", "127.0.0.1"] + ([address] if address else [])
        if not certificate_covers(hosts):
            print("Making a certificate for", ", ".join(hosts), "...")
            if not build_certificate(hosts):
                return 1
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(CERT_FILE, KEY_FILE)

    handler = partial(Handler, directory=str(ROOT))
    server = None
    for _ in range(20):
        try:
            server = Server((args.host, port), handler)
            break
        except OSError:
            port += 1
    if server is None:
        print(f"Could not bind a port near {args.port}.", file=sys.stderr)
        return 1

    if context is not None:
        server.socket = context.wrap_socket(server.socket, server_side=True)

    scheme = "https" if args.https else "http"
    local_url = f"{scheme}://localhost:{port}/"

    print("Jayasongmatch is running.")
    print(f"  On this computer:  {local_url}")
    if address:
        network_url = f"{scheme}://{address}:{port}/"
        print(f"  On the network:    {network_url}")
        if args.https:
            print_ios_instructions(network_url, f"{network_url}cert.crt")
        else:
            print("\n  Phones and tablets can open that address, but Safari and Chrome")
            print("  will refuse the microphone over plain http. Restart with --https")
            print("  to record from a phone or tablet.\n")
    print("Use Chrome, Edge or Safari, allow microphone access, and wear headphones.")
    print("Press Ctrl+C to stop.")

    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(local_url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
