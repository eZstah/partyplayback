import { TabShare } from "../lib/tab-share.js";
import { canCrop, selectShareArea } from "./share-area.js";

export function bootTabSharing({ send, toast, onChange }) {
  const $ = id => document.getElementById(id);
  const video = $("shared-video");
  const available = !!(navigator.mediaDevices?.getDisplayMedia && window.RTCPeerConnection);
  const inMainRoom = () => !document.body.classList.contains("cat-wallpaper");
  let autoplayBlocked = false;
  const sharing = new TabShare({
    send,
    canWatch: inMainRoom,
    capture: async ({ signal }) => {
      const source = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 }, frameRate: { ideal: 30, max: 30 } },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false },
      selfBrowserSurface: "exclude", monitorTypeSurfaces: "exclude", systemAudio: "exclude", surfaceSwitching: "exclude",
      });
      if (signal.aborted) { source.getTracks().forEach(track => track.stop()); throw new DOMException("Cancelled", "AbortError"); }
      if (canCrop()) return selectShareArea(source, signal, toast);
      return source;
    },
    createPeer: config => new RTCPeerConnection(config),
    onError: toast,
    onChange: paint,
    onStream(stream, local) {
      video.srcObject = stream;
      // The sharer hears the source tab. Never echo their captured audio back.
      video.muted = local;
      video.controls = !local;
      autoplayBlocked = false;
      if (stream) void video.play().catch(error => { if (error.name !== "AbortError" && video.srcObject === stream) { autoplayBlocked = true; paint(); } });
      paint();
    },
  });

  function paint() {
    const active = !!sharing.share;
    const pending = !!sharing.pending;
    document.body.classList.toggle("tab-sharing", active);
    $("share-start-btn").hidden = active || pending;
    $("share-start-btn").disabled = !sharing.connected || !available;
    $("share-start-btn").title = available ? "Share a browser tab with the room" : "Start tab sharing from desktop Chrome or Edge";
    $("share-stop-btn").hidden = !sharing.hosting && !pending;
    $("share-stop-btn").textContent = pending ? "Cancel" : "Stop sharing";
    $("share-heading").textContent = active ? (sharing.hosting ? "Your shared tab" : sharing.share.name + " is sharing") : "Watch anything together";
    $("share-hint").textContent = active ? sharing.status : pending ? sharing.status : available ? "TikToks, Reels, Shorts — share a tab with sound." : "Join a shared tab here. To share your own, use desktop Chrome or Edge.";
    $("shared-screen").hidden = !active;
    $("share-message").hidden = !active || (!!video.srcObject && !autoplayBlocked);
    $("share-message-text").textContent = autoplayBlocked ? "Join the shared tab to start picture and sound." : sharing.status;
    $("share-join-btn").hidden = !autoplayBlocked;
    $("share-retry-btn").hidden = !active || sharing.hosting;
    $("share-fullscreen-btn").hidden = !active || !document.fullscreenEnabled;
    $("share-audio-note").hidden = !active || sharing.share.audio;
    // Sharing is a main-room feature. A room already in Aquarium stays there;
    // active main-room viewers keep their sharing controls in reach.
    const aquariumButton = $("cat-aquarium-btn");
    if (aquariumButton) aquariumButton.disabled = active && inMainRoom();
    onChange?.();
  }

  $("share-start-btn").addEventListener("click", () => {
    $("share-crop-hint").textContent = canCrop()
      ? "Next, frame just the video. Your room will see only the area you choose as you scroll."
      : "This browser shares the whole tab. Use desktop Chrome or Edge to select just the video area.";
    $("share-dialog").showModal();
  });
  $("share-confirm-btn").addEventListener("click", () => {
    $("share-dialog").close();
    void sharing.start();
  });
  $("share-stop-btn").addEventListener("click", () => sharing.stop());
  $("share-retry-btn").addEventListener("click", () => {
    if (sharing.config) sharing.watch();
    else { sharing.prepared = null; void sharing.prepare(sharing.share.id); }
  });
  $("share-fullscreen-btn").addEventListener("click", () => $("fullscreen-btn").click());
  $("share-join-btn").addEventListener("click", () => {
    void video.play().then(() => { autoplayBlocked = false; paint(); }).catch(() => toast("Playback could not start. Try Reconnect."));
  });
  new MutationObserver(() => {
    if (inMainRoom() && sharing.share && !sharing.hosting && !sharing.prepared) void sharing.prepare(sharing.share.id);
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  // bootRoom calls update after its other controllers have initialized.
  return sharing;
}
