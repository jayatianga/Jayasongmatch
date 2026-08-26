#!/usr/bin/env python3
"""Produce the Windows, macOS and iOS versions of Jayasongmatch.

All three are built from this one source tree so they cannot drift apart. Each
comes out as a complete, self-contained folder you can copy anywhere and run:

    python build.py                 # build all three
    python build.py macos           # just one
    python build.py --out somewhere # somewhere other than dist/

What actually differs between them:

  Windows   input and channel pickers, Stereo Mix loopback notes, plain http on
            localhost, a double-click .bat launcher.
  macOS     the same pickers, a double-click .command launcher, and notes on
            adding a loopback device since macOS ships none.
  iOS       no input pickers (iOS chooses the device), https with a
            certificate the device can trust, web app manifest, icons and a
            service worker so it installs to the Home Screen and works offline.

Everything else — the recorder, the scoring, the lyrics, the trainer — is the
same code in all three.
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TARGETS = ("windows", "macos", "ios")

# Copied into every build.
SHARED_DIRS = ("js", "css")
SHARED_FILES = ("index.html", "serve.py")

# Copied only into the build that needs them.
TARGET_ONLY = {
    "ios": {
        "files": ("manifest.json", "sw.js"),
        "dirs": ("assets",),
    },
    "windows": {"files": (), "dirs": ()},
    "macos": {"files": (), "dirs": ()},
}

# Never copied: source-only tooling and working files.
SKIP_NAMES = {"__pycache__", ".certs", "node_modules", ".git", "dist"}
SKIP_SUFFIXES = {".pyc"}

# A block may name more than one build: `<!-- build:windows,macos -->`. The
# closing marker repeats the same list, so nested blocks stay unambiguous.
BLOCK = re.compile(
    r"[ \t]*<!--\s*build:(?P<name>[a-z,]+)\s*-->.*?<!--\s*/build:(?P=name)\s*-->[ \t]*\n?",
    re.DOTALL,
)
MARKER = re.compile(r"[ \t]*<!--\s*/?build:[a-z,]+\s*-->[ \t]*\n?")


def strip_blocks(html: str, target: str) -> str:
    """Remove `<!-- build:x -->` sections that are not for this target."""
    def keep(match: re.Match) -> str:
        names = [name.strip() for name in match.group("name").split(",")]
        if target in names:
            # Keep the contents, drop the markers themselves.
            return MARKER.sub("", match.group(0))
        return ""
    return BLOCK.sub(keep, html)


def copy_tree(source: Path, destination: Path) -> int:
    count = 0
    for item in sorted(source.rglob("*")):
        if any(part in SKIP_NAMES for part in item.parts):
            continue
        if item.suffix in SKIP_SUFFIXES:
            continue
        relative = item.relative_to(source)
        target = destination / relative
        if item.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, target)
            count += 1
    return count


WINDOWS_LAUNCHER = """@echo off\r
REM Double-click this file to start Jayasongmatch.\r
setlocal\r
cd /d "%~dp0"\r
\r
where py >nul 2>nul\r
if %errorlevel%==0 (\r
  py serve.py %*\r
  goto :end\r
)\r
\r
where python >nul 2>nul\r
if %errorlevel%==0 (\r
  python serve.py %*\r
  goto :end\r
)\r
\r
echo.\r
echo Python was not found on this PC.\r
echo Install it from https://www.python.org/downloads/windows/ ^(tick "Add python.exe to PATH"^)\r
echo or from the Microsoft Store, then double-click this file again.\r
echo.\r
pause\r
\r
:end\r
endlocal\r
"""

IOS_LAUNCHER = """@echo off\r
REM Double-click this file, then open the network address it prints on your\r
REM iPhone or iPad. See README.md for the one-time certificate setup.\r
setlocal\r
cd /d "%~dp0"\r
\r
where py >nul 2>nul\r
if %errorlevel%==0 (\r
  py serve.py --https %*\r
  goto :end\r
)\r
\r
where python >nul 2>nul\r
if %errorlevel%==0 (\r
  python serve.py --https %*\r
  goto :end\r
)\r
\r
echo.\r
echo Python was not found on this PC.\r
echo Install it from https://www.python.org/downloads/windows/ ^(tick "Add python.exe to PATH"^)\r
echo or from the Microsoft Store, then double-click this file again.\r
echo.\r
pause\r
\r
:end\r
endlocal\r
"""

IOS_LAUNCHER_SH = """#!/bin/sh
# Start the server for iPhone and iPad use, then open the network address it
# prints on the device. See README.md for the one-time certificate setup.
cd "$(dirname "$0")" || exit 1
exec python3 serve.py --https "$@"
"""

# A .command file is what macOS runs when you double-click it in Finder.
MACOS_LAUNCHER = """#!/bin/sh
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
"""

MACOS_IPAD_LAUNCHER = """#!/bin/sh
# Serve over https so an iPhone or iPad on the same Wi-Fi can use the
# microphone. See README.md for the one-time certificate setup on the device.
cd "$(dirname "$0")" || exit 1
exec python3 serve.py --https "$@"
"""


def build_js_module(target: str) -> str:
    return (
        "// Generated by build.py — do not edit.\n"
        f"// This is the {target} build of Jayasongmatch.\n\n"
        f"export const TARGET = '{target}';\n\n"
        f"export const IS_WINDOWS_BUILD = TARGET === 'windows';\n"
        f"export const IS_MACOS_BUILD = TARGET === 'macos';\n"
        f"export const IS_IOS_BUILD = TARGET === 'ios';\n"
        f"export const IS_DESKTOP_BUILD = IS_WINDOWS_BUILD || IS_MACOS_BUILD;\n"
        f"export const IS_UNIVERSAL_BUILD = TARGET === 'universal';\n"
    )


def macos_readme(stamp: str) -> str:
    return f"""# Jayasongmatch — macOS

Record vocal harmony parts one at a time, score how closely each matched, mix
any part in or out, and train the skills behind them.

This is the **macOS version**. Everything runs on this Mac; nothing is uploaded.

## Start it

1. Double-click **`start-macos.command`**. Terminal opens and a browser follows,
   at `http://localhost:8770/`.
2. Click **⟳** beside *Input* and allow microphone access, so your devices
   appear by name.
3. **Put on headphones.**

Press Ctrl+C in the Terminal window, or close it, to stop.

> **"cannot be opened because it is from an unidentified developer"** — macOS
> quarantines files that arrived from the internet. Right-click
> `start-macos.command` → **Open** → **Open**, once. Or clear the flag from
> Terminal: `xattr -d com.apple.quarantine start-macos.command`
>
> **"python3: command not found"** — run `xcode-select --install`, or install
> Python from [python.org](https://www.python.org/downloads/macos/).

Chrome, Edge and Safari all work. Safari needs **14.1 or newer**.

## What this version has

- **Full input device choice.** Any Core Audio input: an interface, a USB
  microphone, or a specific channel of a multi-channel interface via the **Ch**
  dropdown.
- **Keyboard shortcuts** — Space play/stop, `R` record, `L` loop, `Home` rewind,
  `↑`/`↓` change part, `T` stamp a lyric line.

macOS voice processing is switched off deliberately: echo cancellation, noise
suppression and auto gain all distort sung pitch and would make the scores
meaningless.

## Recording what the Mac is playing

macOS has no built-in loopback device — nothing equivalent to Windows' Stereo
Mix. To capture audio playing on the Mac rather than a microphone, install a
virtual audio device:

- **[BlackHole](https://existential.audio/blackhole/)** — free and open source.
  `brew install blackhole-2ch`, or download the installer.
- **Loopback** by Rogue Amoeba — paid, more capable.

Once installed it appears in the **Input** dropdown like any other device. To
hear the audio *and* capture it at the same time, make a **Multi-Output Device**
in *Audio MIDI Setup* combining BlackHole with your speakers or headphones.

For most work you will not need this: import the backing track as a file
instead, which keeps it on its own fader and in time.

## Also singing from an iPhone or iPad?

Run **`./start-ios-server.sh`** in this folder instead. It serves over https so
Safari on the device will hand over the microphone — see the iOS version's
README for the one-time certificate steps.

## Using it

The full guide is in **[GUIDE.md](GUIDE.md)** — targets, lyrics, references, the
accuracy score and the Trainer.

---
Built {stamp} from the shared Jayasongmatch source.
"""


def windows_readme(stamp: str) -> str:
    return f"""# Jayasongmatch — Windows

Record vocal harmony parts one at a time, score how closely each matched, mix
any part in or out, and train the skills behind them.

This is the **Windows version**. Everything runs on this PC; nothing is
uploaded.

## Start it

1. Install Python if you do not have it —
   [python.org/downloads/windows](https://www.python.org/downloads/windows/),
   ticking **Add python.exe to PATH**.
2. Double-click **`start-windows.bat`**. A browser opens at
   `http://localhost:8770/`.
3. Click **⟳** beside *Input* and allow microphone access, so your capture
   devices appear by name.
4. **Put on headphones.**

Close the terminal window or press Ctrl+C in it to stop.

## What this version has

- **Full input device choice.** Every Windows capture endpoint: interface
  inputs, USB microphones, and a specific channel of a multi-channel interface
  via the **Ch** dropdown.
- **Loopback capture.** Select **Stereo Mix**, VoiceMeeter or VB-Cable to record
  what the PC is playing rather than a microphone. If Stereo Mix is missing,
  enable it in *Sound settings → More sound settings → Recording → right-click →
  Show Disabled Devices*.
- **Keyboard shortcuts** — Space play/stop, `R` record, `L` loop, `Home` rewind,
  `↑`/`↓` change part, `T` stamp a lyric line.

Windows voice processing is switched off deliberately: echo cancellation, noise
suppression and auto gain all distort sung pitch and would make the scores
meaningless.

## Using it

The full guide is in **[GUIDE.md](GUIDE.md)** — targets, lyrics, references, the
accuracy score and the Trainer.

## Sharing a session with an iPad

If you also want to sing from an iPhone or iPad, use the iOS version instead:
it serves over https so Safari will hand over the microphone.

---
Built {stamp} from the shared Jayasongmatch source.
"""


def ios_readme(stamp: str) -> str:
    return f"""# Jayasongmatch — iOS

Record vocal harmony parts one at a time, score how closely each matched, mix
any part in or out, and train the skills behind them.

This is the **iPhone and iPad version**. The app runs in Safari on the device;
a computer on the same Wi-Fi serves the files. Nothing is uploaded.

## Start it

On the computer holding this folder:

- **Windows** — double-click **`start-ios-server.bat`**
- **macOS or Linux** — run **`./start-ios-server.sh`**

It prints a network address such as `https://192.168.1.42:8771/`. That is what
the phone opens.

> The first run makes a certificate. That needs either the `cryptography` Python
> package (`python -m pip install cryptography`) or the `openssl` command. The
> server tries both and says so if neither is there.

## Trust the certificate — once per device

Safari will not hand over the microphone to a network address without this.

1. On the iPhone or iPad, open the certificate address the server prints —
   `https://<your-computer>:8771/cert.crt`. Safari warns the connection is not
   private; choose **Show Details → visit this website**.
2. Allow the profile to download.
3. **Settings → General → VPN & Device Management** → tap the profile →
   **Install**.
4. **Settings → General → About → Certificate Trust Settings** → turn on full
   trust for **Jayasongmatch local**.

Then open the network address and allow microphone access when asked.

## Add it to the Home Screen

**Share → Add to Home Screen.** You get a full-screen app with its own storage,
and the app shell is cached so it opens without waiting.

## What differs from the Windows version

Two things iOS does not allow, so they are not in this build:

- **No input or channel picker.** iOS chooses the microphone itself and ignores
  requests for a specific one. Plug in an interface, a wired headset or AirPods
  and iOS switches automatically.
- **No loopback capture.** Nothing on iOS corresponds to Stereo Mix, so import
  backing tracks as files instead — from Files, iCloud Drive, or anywhere the
  picker reaches.

Everything else is the same code: recording, latency calibration, the pitch
ribbon, timed lyrics, references, the mixer, exports and the whole Trainer.

## Getting good recordings

- **Wired headphones beat AirPods.** Bluetooth adds 150–200 ms each way and
  switches to a low-quality microphone profile while recording.
- **Calibrate the latency** in ⚙ — it matters more here than on a desktop.
- **Ringer switch on.** With silent mode engaged iOS mutes web audio, so you
  would record against silence.
- **Keep the app in front.** A call or Siri takes the audio session; the app
  stops and tells you rather than recording nothing.

## Touch controls

| Gesture | Does |
|---|---|
| Tap the ribbon | Seek |
| Drag the ribbon | Scroll through time |
| Pinch the ribbon | Zoom |
| Bar at the bottom | Switch Library / Record / Parts |

Loops come from **Jump to section…** or the **Loop** button, since shift-drag
needs a keyboard.

## Requirements

iOS or iPadOS **15.4 or newer**. The app checks at startup and says plainly what
is missing rather than failing part-way through a take.

## Using it

The full guide is in **[GUIDE.md](GUIDE.md)**.

## If something does not work

**Record button disabled** — the page is not on a trusted https connection.
Re-check the certificate steps above.

**Safari asks about the certificate every time** — step 4 was missed. Installing
the profile is not enough; full trust is a separate switch.

**The phone cannot reach the address** — both devices must be on the same
network, and some routers block devices from talking to each other ("AP
isolation"). Guest networks usually do.

---
Built {stamp} from the shared Jayasongmatch source.
"""


def build(target: str, out_root: Path, guide: str) -> Path:
    destination = out_root / f"jayasongmatch-{target}"
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)

    files = 0
    for name in SHARED_DIRS:
        files += copy_tree(ROOT / name, destination / name)
    for name in SHARED_FILES:
        shutil.copy2(ROOT / name, destination / name)
        files += 1

    extra = TARGET_ONLY[target]
    for name in extra["files"]:
        shutil.copy2(ROOT / name, destination / name)
        files += 1
    for name in extra["dirs"]:
        files += copy_tree(ROOT / name, destination / name)

    # Tell the app which build it is, instead of leaving it to guess.
    (destination / "js" / "build.js").write_text(build_js_module(target), encoding="utf-8")

    # Drop the markup belonging to the other platform.
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    (destination / "index.html").write_text(strip_blocks(html, target), encoding="utf-8")

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if target == "windows":
        (destination / "start-windows.bat").write_text(WINDOWS_LAUNCHER, encoding="utf-8", newline="")
        (destination / "README.md").write_text(windows_readme(stamp), encoding="utf-8")
    elif target == "macos":
        for name, body in (("start-macos.command", MACOS_LAUNCHER),
                           ("start-ios-server.sh", MACOS_IPAD_LAUNCHER)):
            launcher = destination / name
            launcher.write_text(body, encoding="utf-8")
            launcher.chmod(0o755)  # Finder will not run a .command without this
        (destination / "README.md").write_text(macos_readme(stamp), encoding="utf-8")
    else:
        (destination / "start-ios-server.bat").write_text(IOS_LAUNCHER, encoding="utf-8", newline="")
        launcher = destination / "start-ios-server.sh"
        launcher.write_text(IOS_LAUNCHER_SH, encoding="utf-8")
        launcher.chmod(0o755)
        (destination / "README.md").write_text(ios_readme(stamp), encoding="utf-8")

    (destination / "GUIDE.md").write_text(guide, encoding="utf-8")

    total = sum(1 for item in destination.rglob("*") if item.is_file())
    print(f"  {target:8s} -> {destination.relative_to(Path.cwd()) if destination.is_relative_to(Path.cwd()) else destination}  ({total} files)")
    return destination


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the Windows, macOS and iOS versions.")
    parser.add_argument("targets", nargs="*", metavar="TARGET",
                        help=f"which to build: {' or '.join(TARGETS)} (default: both)")
    parser.add_argument("--out", default="dist", help="output directory (default: dist)")
    args = parser.parse_args()

    targets = args.targets or list(TARGETS)
    unknown = [name for name in targets if name not in TARGETS]
    if unknown:
        parser.error(f"unknown target(s): {', '.join(unknown)}. Choose from {', '.join(TARGETS)}.")
    out_root = (Path.cwd() / args.out).resolve()
    out_root.mkdir(parents=True, exist_ok=True)

    # The shared usage guide travels with both builds; each build's own README
    # covers only the setup for that platform.
    guide_source = ROOT / "docs" / "guide.md"
    guide = guide_source.read_text(encoding="utf-8") if guide_source.exists() else "# Guide\n"

    print("Building Jayasongmatch")
    for target in targets:
        build(target, out_root, guide)
    print("\nEach folder is self-contained — copy it anywhere and run its launcher.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
