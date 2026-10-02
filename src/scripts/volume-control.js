export function bindVolumeControl({ slider, muteButton, muteLabel, muteIcon, unmuteIcon, getPlayer, storage, onToggle = () => {}, deviceVolume = false }) {
  let saved = null, lastAudible = 100, pending = null;
  try {
    const value = JSON.parse(storage?.getItem("youple-volume") || "null");
    if (value && Number.isFinite(value.volume) && value.volume >= 0 && value.volume <= 100 && typeof value.muted === "boolean") {
      saved = value;
      lastAudible = value.volume > 0 ? value.volume : 100;
    }
  } catch {}
  slider.hidden = deviceVolume;
  const level = player => Number.isFinite(player.getVolume()) ? Math.max(0, Math.min(100, Math.round(player.getVolume()))) : 100;
  function current(player) {
    const volume = level(player), muted = player.isMuted() || volume === 0;
    if (pending && (Date.now() >= pending.until || (volume === pending.volume && muted === pending.muted))) pending = null;
    return pending || { volume, muted };
  }
  function remember(volume, muted) {
    if (volume > 0) lastAudible = volume;
    try { storage?.setItem("youple-volume", JSON.stringify({ volume: volume || lastAudible, muted })); } catch {}
  }
  function sync() {
    const player = getPlayer();
    muteButton.disabled = slider.disabled = !player;
    if (!player) return;
    const { volume, muted } = current(player);
    if (volume > 0) lastAudible = volume;
    const label = muted ? "Unmute" : "Mute";
    muteButton.dataset.muted = String(muted);
    muteButton.setAttribute("aria-label", label);
    muteButton.title = label + " on your device (M)";
    muteLabel.textContent = label;
    unmuteIcon.hidden = !muted;
    muteIcon.hidden = muted;
    // Keep pointer and keyboard adjustments steady while the iframe responds.
    if (slider.ownerDocument?.activeElement !== slider) slider.value = String(muted ? 0 : volume);
    slider.style.setProperty("--volume", slider.value + "%");
    slider.setAttribute("aria-valuetext", slider.value + "%");
  }
  slider.addEventListener("input", () => {
    const player = getPlayer();
    if (!player || deviceVolume) return;
    const volume = Number(slider.value);
    pending = { volume, muted: volume === 0, until: Date.now() + 1500 };
    player.setVolume(volume);
    if (volume === 0) player.mute(); else player.unMute();
    remember(volume, volume === 0);
    slider.style.setProperty("--volume", volume + "%");
    slider.setAttribute("aria-valuetext", volume + "%");
    sync();
  });
  slider.addEventListener("blur", sync);
  muteButton.addEventListener("click", () => {
    const player = getPlayer();
    if (!player) return;
    const before = current(player);
    const muted = !before.muted;
    const volume = before.volume || lastAudible;
    pending = { volume, muted, until: Date.now() + 1500 };
    if (muted) player.mute();
    else { if (before.volume === 0) player.setVolume(volume); player.unMute(); }
    remember(volume, muted);
    sync();
    onToggle(muted);
  });
  sync();
  return {
    sync,
    ready(player) {
      if (saved) {
        if (!deviceVolume) player.setVolume(saved.volume);
        if (saved.muted) player.mute(); else player.unMute();
        pending = { volume: deviceVolume ? level(player) : saved.volume, muted: saved.muted || saved.volume === 0, until: Date.now() + 1500 };
      }
      sync();
    },
  };
}
