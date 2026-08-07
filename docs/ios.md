# Running on iPhone and iPad

The app runs in Safari on iOS and iPadOS. Two things are different from the
desktop, and both are iOS limits rather than gaps in the app:

- **iOS picks the microphone, not the page.** There is no input or channel
  selector, because iOS ignores requests for a specific device. Plug in a USB
  interface, a Lightning/USB-C headset or AirPods and iOS switches to it
  automatically. Those controls are hidden rather than left there doing nothing.
- **There is no loopback input.** Nothing on iOS corresponds to Stereo Mix, so
  you cannot capture what the device is playing. Import backing tracks as files
  instead — from the Files app, iCloud Drive or anywhere the file picker
  reaches. That is the normal way to work here anyway.

Everything else works: recording, latency calibration, the pitch ribbon, timed
lyrics, references, the mixer, exports, and the whole Trainer.

---

## Setting it up

Microphone access needs a *secure context*. On the computer running the server
`http://localhost` counts as one automatically. A phone connecting across your
network does not, so the server has to serve HTTPS and the device has to trust
its certificate.

### 1. Start the server with HTTPS

On the computer holding the app:

```
python serve.py --https
```

It prints two addresses. The **network** one — something like
`https://192.168.1.42:8771/` — is what the phone uses. Both devices must be on
the same Wi-Fi.

The first run makes a certificate. That needs either the `cryptography` Python
package (`python -m pip install cryptography`) or the `openssl` command; the
server tries both and tells you if neither is available.

> The certificate is stored in `.certs/` and is not committed. It covers
> `localhost` and your computer's current network address, and is rebuilt
> automatically if that address changes.

### 2. Trust the certificate on the device

Once per device. Without this Safari will not hand over the microphone.

1. On the iPhone or iPad, open the certificate address the server prints —
   `https://<your-computer>:8771/cert.crt`. Safari warns that the connection is
   not private; choose **Show Details → visit this website** to reach it.
2. Allow the profile to download.
3. **Settings → General → VPN & Device Management** → tap the downloaded
   profile → **Install**.
4. **Settings → General → About → Certificate Trust Settings** → turn on full
   trust for **Jayasongmatch local**.

### 3. Open the app

Go to the network address. Safari asks for microphone permission the first time
you record — allow it.

### 4. Add it to the Home Screen

**Share → Add to Home Screen.** This gives a full-screen app with no browser
chrome, its own storage, and the app shell cached so it opens without waiting.

---

## Getting good recordings on iOS

**Use headphones, always.** Wired ones are better than Bluetooth: AirPods add
roughly 150–200 ms of delay in each direction and switch to a low-quality
microphone profile when they are recording, which will hurt your scores.

**Calibrate the latency.** iOS round-trip delay is higher and more variable than
a desktop interface, so **⚙ → Calibrate latency** matters more here. Redo it if
you change headphones or plug in an interface.

**Turn the ringer switch on.** With the silent switch engaged, iOS mutes web
audio playback, so you get a take recorded against silence.

**Keep the app in front.** iOS takes the audio session away for a phone call,
Siri, or when you switch apps. The app notices, stops the transport and tells
you rather than leaving a take that silently recorded nothing — but the take is
lost either way. The screen is kept awake while recording.

**Watch the storage.** Safari clears site data after about a week of not opening
a site. The app asks for persistent storage, which usually prevents that, and
adding it to the Home Screen makes it much more likely to be granted. Export
anything you want to keep.

---

## Touch controls

| Gesture | Does |
|---|---|
| Tap the ribbon | Seek |
| Drag the ribbon | Scroll through time |
| Pinch the ribbon | Zoom in and out |
| Bar at the bottom | Switch between Library, Record and Parts |

Setting a loop by shift-dragging needs a keyboard, so on touch use **Jump to
section…** — picking a section seeks there and loops it — or the **Loop** button,
which loops whichever section the playhead is in.

---

## Requirements

- iOS or iPadOS **15.4 or newer**. AudioWorklet needs 14.5, module workers and
  `<dialog>` need 15.4.
- The app checks on startup and says plainly which piece is missing rather than
  failing halfway through a take.

## If something does not work

**"Microphone capture unavailable" or the record button is disabled** — the page
is not on a secure connection. Check the address starts `https://` and that you
completed the certificate trust steps above.

**Safari asks about the certificate every time** — step 4 was missed. The profile
being installed is not enough; full trust has to be switched on separately in
Certificate Trust Settings.

**The phone cannot reach the address** — both devices must be on the same network,
and some routers block devices from talking to each other ("AP isolation" or
"client isolation"). A guest network usually has this on.

**Recording is very quiet** — iOS applies its own gain. Sing closer, or use an
interface with its own preamp.
