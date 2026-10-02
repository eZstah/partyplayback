import { bootAuth } from "./auth-client.js";

export function bootHome() {
  const auth = bootAuth();
  const createDialog = document.getElementById("create-dialog");
  const joinDialog = document.getElementById("join-dialog");
  const createForm = document.getElementById("create-form");
  const createMessage = document.getElementById("create-message");
  const signedIn = document.body.dataset.signedIn === "true";
  let busy = false;
  function updateMode() {
    const member = createForm.elements.mode.value === "member";
    document.getElementById("room-mode-note").textContent = member ? "Saved to your account. Everyone signs in to join." : "Anyone with the link can join. No sign-in needed.";
    createForm.querySelector("button[type=submit]").textContent = member && !signedIn ? "Sign in to create your room" : "Create room →";
  }
  document.querySelectorAll("[data-create-room]").forEach(button => button.addEventListener("click", () => {
    createForm.elements.mode.value = button.dataset.createRoom;
    updateMode();
    createDialog.showModal();
  }));
  document.querySelectorAll("[data-join-room]").forEach(button => button.addEventListener("click", () => joinDialog.showModal()));
  createForm.addEventListener("change", updateMode);
  createForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const mode = createForm.elements.mode.value;
    if (mode === "member" && !signedIn) {
      try { sessionStorage.setItem("pp_room_draft", createForm.elements.title.value); } catch {}
      createDialog.close();
      auth.open("/?create=member");
      return;
    }
    busy = true;
    const submit = createForm.querySelector("button[type=submit]");
    submit.disabled = true; submit.textContent = "Making room…"; createMessage.textContent = "";
    try {
      const response = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, title: createForm.elements.title.value }) });
      const data = await response.json();
      if (response.ok) location.assign(data.url);
      else if (data.signIn) { try { sessionStorage.setItem("pp_room_draft", createForm.elements.title.value); } catch {} createDialog.close(); auth.open("/?create=member"); }
      else createMessage.textContent = data.message || "Couldn't create your room. Try again.";
    } catch { createMessage.textContent = "Couldn't connect. Please try again."; }
    finally { busy = false; submit.disabled = false; updateMode(); }
  });
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
    try { createForm.elements.title.value = sessionStorage.getItem("pp_room_draft") || ""; sessionStorage.removeItem("pp_room_draft"); } catch {}
    createForm.elements.mode.value = "member"; updateMode(); createDialog.showModal();
    history.replaceState({}, "", "/");
  }
  const art = document.querySelector(".hero-art");
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches && matchMedia("(pointer: fine)").matches) {
    art.addEventListener("pointermove", event => {
      const rect = art.getBoundingClientRect();
      art.style.setProperty("--mx", ((event.clientX - rect.left) / rect.width - .5) * 16 + "px");
      art.style.setProperty("--my", ((event.clientY - rect.top) / rect.height - .5) * 16 + "px");
    });
    art.addEventListener("pointerleave", () => { art.style.setProperty("--mx", "0px"); art.style.setProperty("--my", "0px"); });
  }
}
