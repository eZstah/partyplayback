# youple.tv: Send to room

A Chrome extension (also works in Edge and Brave) that sends the YouTube video
you're on to your youple.tv room, so nobody has to copy and paste links.

- **Click the extension icon** in Chrome's toolbar (or press **Alt+Shift+Y**) on a
  YouTube video: it shows the video and your rooms. Pick a room and click
  **Send to <room>**.
- **Hover any video thumbnail** on YouTube and click the cat in its corner.
- On a video page, click **Send to <room>** next to the Subscribe button.
- **Right-click** any YouTube video link and pick "Send to …".
- Rooms show up in the list once you've opened them. The thumbnail and page
  buttons send to the room picked last. An open room adds the video without a
  reload; otherwise the room opens in a background tab with the video added
  (`/room/<name>?add=<YouTube link>`).

It only stores the links and names of rooms you opened, in the browser. It sends a
video's link to your room only when you click one of its buttons or the menu.

## Try it

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this `extension` folder.
3. Open a youple.tv room, then go to YouTube and click the extension icon.
   Pin it from the puzzle-piece menu so it stays in the toolbar.

`http://localhost:8787` rooms work too, for `npm run preview`.

## Publishing

Zip the contents of this folder and upload it in the
[Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole).
Bump `version` in `manifest.json` for each upload.
