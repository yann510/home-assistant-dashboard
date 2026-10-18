# Upstream arm64 image, librespot 0.8.0 d36f9f1; see README for provenance.
FROM giof71/librespot@sha256:e2dfcd776c73069b98820a849ccce48842e1381cea069b76e15327dcbfa5cd88
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends pulseaudio \
    && rm -rf /var/lib/apt/lists/*
COPY relay.py /opt/dashboard-relay/relay.py
COPY LICENSE.librespot LICENSE.upstream-image /opt/dashboard-relay/
LABEL io.hass.name="Dashboard Spotify Relay" \
      io.hass.description="Private paced silent Spotify Connect staging receiver" \
      io.hass.type="addon" \
      io.hass.version="1.0.0" \
      io.hass.arch="aarch64"
WORKDIR /opt/dashboard-relay
# PID 1 drops supplementary groups and switches to uid/gid 1000 before children.
ENTRYPOINT ["python3", "/opt/dashboard-relay/relay.py"]
