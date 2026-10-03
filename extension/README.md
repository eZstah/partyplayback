# youple.tv: Send to room

A Chrome extension (also works in Edge and Brave) that sends the YouTube video
you're on to your youple.tv room, so nobody has to copy and paste links.

- **Click the extension icon** in Chrome's toolbar (or press **Alt+Shift+Y**) on a
  YouTube video: it shows the video and your rooms. Pick a room and click
  **Send to <room>**.
- **Hover any video thumbnail** on YouTube and click the cat in its corner.
- On a video page, click **Send to <room>** next to the Subscribe button. On
  Shorts, click the round youple button under Share.
- **Right-click** any YouTube video link and pick "Send to …".
- Rooms show up in the list once you've opened them, and your saved rooms show up
  when you're signed in on youple.tv. The thumbnail and page
  buttons send to the room picked last. An open room adds the video without a
  reload; otherwise the room opens in a background tab with the video added
  (`/room/<name>?add=<YouTube link>`).

It only stores the links and names of rooms you opened or saved, in the browser. It sends a
video's link to your room only when you click one of its buttons or the menu.

## Try it

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this `extension` folder.
3. Open a youple.tv room, then go to YouTube and click the extension icon.
   Pin it from the puzzle-piece menu so it stays in the toolbar.

`http://localhost:8787` rooms work too, for `npm run preview`.

## Publishing

Run `npm run pack:extension` from the project root to create
`dist/youple-extension-<version>.zip`. The package excludes the localhost
development permissions and this README. Upload that ZIP in the
[Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole).
Bump `version` in `manifest.json` for each upload.

The website build also generates this ZIP. Until `CHROME_STORE_URL` is set in
`src/lib/extension.ts`, `/extension` offers it as a developer preview with
manual installation and update instructions. The download name and displayed
version come from the manifest. Once the store URL is set, the page shows the
store install link instead of the preview section.
