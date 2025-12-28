(function () {
  function enablePinchZoom({
    el,
    getState,
    setState,
    min = 0.1,
    max = 5,
    onUpdate,
  }) {
    if (!el) return;

    let active = false;
    let startDist = 0;
    let startZoom = 1;
    let startX = 0;
    let startY = 0;
    let startMidX = 0;
    let startMidY = 0;

    el.style.touchAction = "none";

    el.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length !== 2) return;
        e.preventDefault();

        const [a, b] = e.touches;
        startDist =
          Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;

        const s = getState();
        startZoom = s.zoom;
        startX = s.x;
        startY = s.y;

        startMidX = (a.clientX + b.clientX) / 2;
        startMidY = (a.clientY + b.clientY) / 2;

        active = true;
      },
      { passive: false },
    );

    el.addEventListener(
      "touchmove",
      (e) => {
        if (!active || e.touches.length !== 2) return;
        e.preventDefault();

        const [a, b] = e.touches;
        const dist =
          Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
        const ratio = dist / startDist;

        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        const midX = (a.clientX + b.clientX) / 2;
        const midY = (a.clientY + b.clientY) / 2;

        const zoom = Math.max(min, Math.min(max, startZoom * ratio));
        const applied = zoom / startZoom;

        const panX = startX + (midX - startMidX) + (1 - applied) * (midX - cx);
        const panY = startY + (midY - startMidY) + (1 - applied) * (midY - cy);

        setState({ zoom, x: panX, y: panY });
        onUpdate?.();
      },
      { passive: false },
    );

    const end = () => (active = false);
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
  }

  // expose helper
  window.__enablePinchZoom = enablePinchZoom;
})();
