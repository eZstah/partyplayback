// The Chrome Web Store listing for the "Send to room" extension (extension/).
// Links to it on the home page and in the footer stay hidden until this is filled in.
export const CHROME_STORE_URL = "";

export function extensionListed(url = CHROME_STORE_URL) {
  return url.startsWith("https://chromewebstore.google.com/");
}
