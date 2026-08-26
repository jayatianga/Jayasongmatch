# Jayasongmatch — macOS

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
Built 2026-08-26 from the shared Jayasongmatch source.
