// The Chrome Web Store listing for the "Send to room" extension (extension/).
// The home-page recommendation stays hidden until this is filled in.
// The extension page offers a developer preview until the store listing is available.
export const CHROME_STORE_URL = "";

export function extensionListed(url = CHROME_STORE_URL) {
  return url.startsWith("https://chromewebstore.google.com/");
}
