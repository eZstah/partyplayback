import { bootAuth } from "./auth-client.js";

export function bootHome() {
  const auth = bootAuth();
  const joinDialog = document.getElementById("join-dialog");
  const createForm = document.getElementById("create-form");
  const createMessage = document.getElementById("create-message");
  const savedForm = document.getElementById("saved-room-form");
  const savedDialog = document.getElementById("saved-room-dialog");
  const savedMessage = document.getElementById("saved-room-message");
  const signedIn = document.body.dataset.signedIn === "true";
  function openSavedRoom() {
    if (!signedIn) { auth.open("/?create=member"); return; }
    if (!savedDialog.open) savedDialog.showModal();
    savedForm.elements.title.focus();
  }
  document.querySelectorAll("[data-create-room]").forEach(button => button.addEventListener("click", () => {
    openSavedRoom();
  }));
  document.querySelectorAll("[data-join-room]").forEach(button => button.addEventListener("click", () => joinDialog.showModal()));
  function bindCreation(form, mode, message) {
    let busy = false;
    form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const title = mode === "member" ? form.elements.title.value : undefined;
    if (mode === "member" && !signedIn) {
      try { sessionStorage.setItem("pp_room_draft", title); } catch {}
      savedDialog.close(); auth.open("/?create=member");
      return;
    }
    busy = true;
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true; submit.querySelector("span").textContent = "Making room…"; message.textContent = "";
    try {
      const response = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, title }) });
      const data = await response.json();
      if (response.ok) location.assign(data.url);
      else if (data.signIn) { try { sessionStorage.setItem("pp_room_draft", title || ""); } catch {} savedDialog.close(); auth.open("/?create=member"); }
      else message.textContent = data.message || "Couldn't create your room. Try again.";
    } catch { message.textContent = "Couldn't connect. Please try again."; }
    finally { busy = false; submit.disabled = false; submit.querySelector("span").textContent = mode === "member" ? "Create saved room" : "Create room"; }
    });
  }
  bindCreation(createForm, "guest", createMessage);
  bindCreation(savedForm, "member", savedMessage);
  document.getElementById("join-form").addEventListener("submit", event => {
    event.preventDefault();
    let value = document.getElementById("room-code").value.trim();
    try {
      if (/^https?:\/\//i.test(value)) value = new URL(value).pathname.split("/room/")[1] || "";
      else value = value.replace(/^\/room\//, "");
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(value)) throw new Error("Invalid code");
      location.assign("/room/" + value);
    } catch { document.getElementById("join-message").textContent = "That invite doesn't look right. Paste a room link or room code."; }
  });
  if (new URLSearchParams(location.search).get("create") === "member") {
    try { savedForm.elements.title.value = sessionStorage.getItem("pp_room_draft") || ""; sessionStorage.removeItem("pp_room_draft"); } catch {}
    openSavedRoom();
    history.replaceState({}, "", "/");
  }
  const art = document.querySelector(".mascot-cast");
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches && matchMedia("(pointer: fine)").matches) {
    document.querySelector(".hangout").addEventListener("pointermove", event => {
      const rect = art.getBoundingClientRect();
      art.style.setProperty("--look-x", Math.max(-3, Math.min(3, ((event.clientX - rect.left) / rect.width - .5) * 6)) + "px");
      art.style.setProperty("--look-y", Math.max(-3, Math.min(3, ((event.clientY - rect.top) / rect.height - .5) * 6)) + "px");
    });
    document.querySelector(".hangout").addEventListener("pointerleave", () => { art.style.setProperty("--look-x", "0px"); art.style.setProperty("--look-y", "0px"); });
  }
}
