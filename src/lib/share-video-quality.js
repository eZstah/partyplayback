// Preserve source pixels until the crop is known. A 720p whole-tab capture can
// leave a portrait video only a few hundred pixels wide before encoding starts.
export const captureVideoConstraints = {
  width: { ideal: 3840, max: 3840 },
  height: { ideal: 2160, max: 2160 },
  frameRate: { ideal: 30, max: 30 },
};

// Full HD in either orientation, without enlarging a smaller source.
export function videoDownscale(width, height) {
  return Math.max(1, Math.max(width, height) / 1920, Math.min(width, height) / 1080);
}

export async function tuneVideoSender(sender) {
  if (sender?.track?.kind !== "video") return false;
  try {
    const parameters = sender.getParameters();
    // Keep the negotiated encoding count and transaction id intact.
    if (!parameters.encodings?.length) return false;
    const { width = 0, height = 0 } = sender.track.getSettings();
    parameters.degradationPreference = "maintain-resolution";
    for (const encoding of parameters.encodings) {
      encoding.maxBitrate = 6_000_000;
      encoding.maxFramerate = 30;
      encoding.scaleResolutionDownBy = videoDownscale(width, height);
    }
    await sender.setParameters(parameters);
    return true;
  } catch {
    // Unsupported quality hints or a viewer leaving must not break sharing.
    return false;
  }
}
