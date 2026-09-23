class HakitDashboardPanel extends HTMLElement {
  connectedCallback() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    // HA's custom-panel host can have automatic height. Percentage height then
    // leaves the iframe at its default 150px. Size against the viewport instead,
    // subtracting the safe-area padding already applied by Home Assistant.
    const insets = "var(--safe-area-inset-top, 0px) - var(--safe-area-inset-bottom, 0px)";
    this.style.cssText = `position:relative;width:100%;display:block;box-sizing:border-box;height:calc(100vh - ${insets});height:calc(100dvh - ${insets});`;
    const iframe = document.createElement("iframe");
    // The dashboard index.html is served from /local/ with a 31-day Cache-Control,
    // so a rebuilt dashboard (new hashed asset filenames) would otherwise white-screen
    // returning visitors whose cached index.html still points at deleted assets.
    // Appending a unique query per mount forces the tiny HTML entry point to be fetched
    // fresh every load; the hashed assets it references stay cached (immutable).
    iframe.src = "/local/dashboard/index.html?t=" + Date.now();
    iframe.title = "HAKit Dashboard";
    iframe.style.cssText = "width:100%;height:100%;border:none;display:block;";
    this.appendChild(iframe);
  }
}
customElements.define("hakit-dashboard-panel", HakitDashboardPanel);
