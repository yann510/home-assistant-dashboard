(function () {
  'use strict';
  if (document.getElementById('dashboard-viewport-probe')) return;
  var panel = document.createElement('aside');
  panel.id = 'dashboard-viewport-probe';
  panel.style.cssText =
    'position:fixed;z-index:2147483647;bottom:6px;left:6px;max-width:95vw;padding:8px;background:#111;color:#fff;border:1px solid #aaa;border-radius:8px;font:12px/1.4 monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-height:45vh;overflow:auto;';
  var text = document.createElement('span');
  var close = document.createElement('button');
  close.textContent = 'Close measurements';
  close.style.cssText = 'display:block;margin-top:6px;min-height:40px;padding:6px 12px;';
  function update() {
    var v = window.visualViewport;
    text.textContent =
      'Actual dashboard frame\n' +
      JSON.stringify(
        {
          inner: [window.innerWidth, window.innerHeight],
          documentClient: [document.documentElement.clientWidth, document.documentElement.clientHeight],
          visualViewport: v ? [v.width, v.height, v.scale] : null,
          devicePixelRatio: window.devicePixelRatio,
          screen: [screen.width, screen.height],
          orientation: screen.orientation ? screen.orientation.type : window.orientation,
          userAgent: navigator.userAgent,
        },
        null,
        1
      );
  }
  close.onclick = function () {
    window.removeEventListener('resize', update);
    window.removeEventListener('orientationchange', update);
    if (window.visualViewport) window.visualViewport.removeEventListener('resize', update);
    panel.remove();
  };
  panel.appendChild(text);
  panel.appendChild(close);
  document.body.appendChild(panel);
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', update);
  update();
})();
