export function bootAuth() {
  const dialog = document.getElementById("auth-dialog");
  if (!dialog) return { open() {} };
  const message = document.getElementById("auth-message");
  let next = "/", busy = false;
  const open = (returnTo = location.pathname) => {
    next = returnTo;
    if (!dialog.open) dialog.showModal();
  };
  document.querySelectorAll("[data-sign-in]").forEach(button => button.addEventListener("click", () => open()));
  document.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));
  document.querySelectorAll("dialog").forEach(modal => modal.addEventListener("click", event => {
    if (event.target !== modal) return;
    const bounds = modal.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) modal.close();
  }));
  async function signIn(provider, email) {
    if (busy) return;
    busy = true;
    message.textContent = provider === "magic" ? "Sending your link…" : "Opening sign-in…";
    dialog.querySelectorAll(".provider-button,button[type=submit]").forEach(button => { button.disabled = true; });
    try {
      const response = await fetch("/auth/signin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, email, next }) });
      const data = await response.json();
      if (data.url) location.assign(data.url);
      else message.textContent = data.message || "Please try again.";
    } catch { message.textContent = "Couldn't connect. Please try again."; }
    finally {
      busy = false;
      dialog.querySelectorAll(".provider-button,button[type=submit]").forEach(button => { button.disabled = false; });
    }
  }
  dialog.querySelectorAll("[data-provider]").forEach(button => button.addEventListener("click", () => signIn(button.dataset.provider)));
  document.getElementById("magic-form").addEventListener("submit", event => {
    event.preventDefault(); signIn("magic", document.getElementById("auth-email").value.trim());
  });
  document.querySelectorAll("[data-sign-out]").forEach(button => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const response = await fetch("/auth/signout", { method: "POST" });
      if (response.ok) location.assign("/");
      else { button.disabled = false; button.textContent = "Try sign out again"; }
    } catch { button.disabled = false; }
  }));
  const query = new URLSearchParams(location.search);
  if (query.has("signin")) {
    open(query.get("next") || "/");
    if (query.has("auth_error")) message.textContent = "That link expired or couldn't be verified. Please sign in again.";
    history.replaceState({}, "", location.pathname);
  }
  return { open };
}
