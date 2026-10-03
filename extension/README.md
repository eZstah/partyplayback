# youple.tv: Send to room

A Chrome extension (also works in Edge and Brave) that sends the YouTube video
you're on to your youple.tv room, so nobody has to copy and paste links.

- **Hover any video thumbnail** on YouTube and click "Send to <room>".
- On a video page, click **Send to <room>** next to the Subscribe button.
- The **toolbar button** or **Alt+Shift+Y** on a YouTube video also sends it.
- **Right-click** any YouTube video link or thumbnail and pick "Send to …".
- It sends to the last room you opened. If that room is open in a tab, the video
  joins the playlist there without a reload; otherwise the room opens in a
  background tab with the video added (`/room/<name>?add=<YouTube link>`).

It only stores the last room's link and name, in the browser. It sends a
video's link to your room only when you click one of its buttons or the menu.

## Try it

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this `extension` folder.
3. Open a youple.tv room, then go to YouTube and hover a thumbnail.

`http://localhost:8787` rooms work too, for `npm run preview`.

## Publishing

Zip the contents of this folder and upload it in the
[Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole).
Bump `version` in `manifest.json` for each upload.
