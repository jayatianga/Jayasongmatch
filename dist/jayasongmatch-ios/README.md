# Jayasongmatch — iOS

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
Built 2026-08-07 from the shared Jayasongmatch source.
