/* ============================================================
   BILAD AUTO — hero.js
   Interactive X-Ray Hero Section
   - Desktop: spotlight follows mouse with LERP smoothing
   - Mobile/Touch: auto-animates through waypoints
   - Spotlight hint fades on first interaction or after 4s
   - Subtle parallax on scroll for car and base layers
   ============================================================ */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     1. WAIT FOR DOM
  ---------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    /* --------------------------------------------------------
       2. ELEMENT REFERENCES — bail early if hero not present
    -------------------------------------------------------- */
    const xrayLayer = document.querySelector('.layer-xray');
    const heroSection = document.querySelector('.hero-section');

    if (!xrayLayer || !heroSection) return; // Not on hero page

    const layerCar  = document.querySelector('.layer-car');
    const layerBase = document.querySelector('.layer-base');
    const hint      = document.querySelector('.spotlight-hint');

    /* --------------------------------------------------------
       3. LERP MOUSE TRACKING STATE
       tx/ty = target (mouse position, 0–100%)
       cx/cy = current (lerped, 0–100%)
    -------------------------------------------------------- */
    let tx = 50, ty = 50;
    let cx = 50, cy = 50;

    /* --------------------------------------------------------
       4. TOUCH AUTO-ANIMATION WAYPOINTS
       Each {x, y} in percentages — points at interesting
       areas of the SVG grid (house locations, solar panels).
    -------------------------------------------------------- */
    const waypoints = [
      { x: 20, y: 25 },  // House 1 — top-left cluster
      { x: 65, y: 30 },  // House 2 — top-right area
      { x: 45, y: 45 },  // House 3 — center
      { x: 80, y: 55 },  // House 4 — right-mid
      { x: 50, y: 60 },  // House 5 — mid-center
      { x: 30, y: 75 },  // House 6 — bottom-left
      { x: 75, y: 70 },  // House 7 — bottom-right
      { x: 15, y: 55 },  // House 8 — left-mid
    ];

    let currentWaypoint = 0;
    let waypointTimer   = null; // holds setTimeout id while waiting
    let waitingAtWaypoint = false;

    /* --------------------------------------------------------
       5. HELPER — detect touch/coarse-pointer device
    -------------------------------------------------------- */
    function isTouchDevice() {
      return !window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    }

    /* --------------------------------------------------------
       6. MOUSE TRACKING (desktop)
    -------------------------------------------------------- */
    document.addEventListener('mousemove', function (e) {
      tx = (e.clientX / window.innerWidth)  * 100;
      ty = (e.clientY / window.innerHeight) * 100;
    });

    /* --------------------------------------------------------
       7. TOUCH POSITION TRACKING
       Allow scroll (passive), just update spotlight coords.
    -------------------------------------------------------- */
    heroSection.addEventListener('touchmove', function (e) {
      const touch = e.touches[0];
      tx = (touch.clientX / window.innerWidth)  * 100;
      ty = (touch.clientY / window.innerHeight) * 100;
    }, { passive: true });

    /* --------------------------------------------------------
       8. SPOTLIGHT HINT — hide after 4s or on first interaction
    -------------------------------------------------------- */
    let hintHidden = false;

    function hideHint() {
      if (hintHidden || !hint) return;
      hintHidden = true;
      hint.classList.add('hidden');
    }

    // Auto-hide after 4 seconds
    setTimeout(hideHint, 4000);

    // Hide immediately on first mouse move
    document.addEventListener('mousemove', hideHint, { once: true });

    /* --------------------------------------------------------
       9. ADVANCE TO NEXT WAYPOINT (touch auto-animation)
    -------------------------------------------------------- */
    function advanceWaypoint() {
      currentWaypoint = (currentWaypoint + 1) % waypoints.length;
      waitingAtWaypoint = false;
      waypointTimer = null;
    }

    /* --------------------------------------------------------
       10. MAIN ANIMATION LOOP
    -------------------------------------------------------- */
    function animate() {
      // Skip animation work when tab is hidden (battery/CPU saving)
      if (document.visibilityState === 'hidden') {
        requestAnimationFrame(animate);
        return;
      }

      if (isTouchDevice()) {
        /* ---- TOUCH: lerp toward current waypoint ---------- */
        const target = waypoints[currentWaypoint];
        const speed  = 0.005; // slower than mouse lerp — gentle drift

        cx += (target.x - cx) * speed;
        cy += (target.y - cy) * speed;

        // Check proximity — when close enough, pause then move on
        const dx   = target.x - cx;
        const dy   = target.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 1 && !waitingAtWaypoint) {
          waitingAtWaypoint = true;
          // Wait 2 seconds at this waypoint then advance
          waypointTimer = setTimeout(advanceWaypoint, 2000);
        }
      } else {
        /* ---- DESKTOP: lerp toward mouse ------------------- */
        cx += (tx - cx) * 0.08;
        cy += (ty - cy) * 0.08;
      }

      // Apply spotlight position via CSS custom properties
      xrayLayer.style.setProperty('--mx', cx + '%');
      xrayLayer.style.setProperty('--my', cy + '%');

      requestAnimationFrame(animate);
    }

    /* --------------------------------------------------------
       11. SCROLL PARALLAX
       Car layer drifts slightly faster than base layer,
       creating a subtle depth illusion.
    -------------------------------------------------------- */
    function onScroll() {
      const scrollY = window.scrollY || window.pageYOffset;

      if (layerCar) {
        layerCar.style.transform = 'translateY(' + (scrollY * 0.15) + 'px)';
      }
      if (layerBase) {
        layerBase.style.transform = 'translateY(' + (scrollY * 0.05) + 'px)';
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });

    /* --------------------------------------------------------
       12. WINDOW RESIZE — reset lerp target to center so the
       spotlight doesn't jump to a stale position after resize.
    -------------------------------------------------------- */
    window.addEventListener('resize', function () {
      // Re-center on resize; next mousemove will snap it back
      if (!isTouchDevice()) {
        tx = 50;
        ty = 50;
      }
    });

    /* --------------------------------------------------------
       13. VISIBILITY CHANGE — clear waypoint timer when hidden
       so we don't accumulate setTimeout debt while away.
    -------------------------------------------------------- */
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && waypointTimer) {
        clearTimeout(waypointTimer);
        waypointTimer = null;
        waitingAtWaypoint = false;
      }
    });

    /* --------------------------------------------------------
       14. KICK OFF THE LOOP
    -------------------------------------------------------- */
    animate();
  }

})();
