# Custom panel height regression

Run `python3 -m http.server 8793 --bind 127.0.0.1 --directory home-assistant`
from the repository root and open `/tests_panel/height.html` on that server.
The fixture models an automatic-height Home Assistant panel host with 24px/16px
safe-area padding. It loads the production wrapper, then replaces the frame
content with a blank document so geometry is tested without HA credentials.

The result must say `passed: true`, including after resizing or rotating.
The original wrapper produces a 150px iframe in a 720px viewport (expected
680px). The fixed wrapper passed 720px, 1280px, and 800px viewport heights,
with iframe heights of 680px, 1240px, and 760px respectively.

## Deployment

`home-assistant/www/hakit-panel.js` maps to `/homeassistant/www/hakit-panel.js`
on the host. This is the outer custom panel; it is not part of the React build.
Back up the live script and configuration before replacing them. Update its
`panel_custom.module_url` cache-buster and restart Core so existing browsers
receive a new module URL. September 20 deployment uses
`/local/hakit-panel.js?v=20260920-height`.

The wrapper uses a viewport height with a `vh` fallback for older WebViews
and subtracts the safe-area padding supplied by Home Assistant. This prevents
percentage height from resolving against an auto-height ancestor and falling
back to the iframe's default 150px height. The iframe retains its own scrolling.

Live files were backed up privately, downloaded after deployment to check exact
contents, and `ha core check` passed. Tablet hardware confirmation still requires
the user to reopen the normal Home Assistant dashboard.
