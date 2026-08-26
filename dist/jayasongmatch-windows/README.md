# Jayasongmatch — Windows

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
Built 2026-08-26 from the shared Jayasongmatch source.
