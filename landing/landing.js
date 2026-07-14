/* fajneoceny.pl landing — scroll reveals.
   Zero dependencies: IntersectionObserver drives a CSS class; the browser
   handles the transition. Brand motion: soft ease-out, no loops, no bounce. */

(function () {
  'use strict';

  // Hero waveform: two aligned layers (dim track + cyan fill) with identical
  // bar heights, so a CSS clip can sweep the fill continuously. Built for all
  // users (static shape even without motion).
  var wave = document.querySelector('.wave');
  if (wave) {
    var waveHeights = [];
    for (var i = 0; i < 28; i++) waveHeights.push((6 + Math.abs(Math.sin(i * 0.9)) * 30).toFixed(0));
    ['wave-track', 'wave-fill'].forEach(function (cls) {
      var layer = document.createElement('div');
      layer.className = cls;
      waveHeights.forEach(function (h) {
        var b = document.createElement('span');
        b.style.height = h + 'px';
        layer.appendChild(b);
      });
      wave.appendChild(layer);
    });
  }

  var docEl = document.documentElement;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // No animation path (reduced motion or unsupported): drop .js so the CSS
  // shows everything at full opacity, then stop.
  if (reduced || !('IntersectionObserver' in window)) {
    docEl.classList.remove('js');
    return;
  }

  // Reveal a set of elements top-to-bottom with a small stagger. The delay is
  // temporary — cleared once played so it never slows later transitions.
  function reveal(els) {
    els.sort(function (a, b) {
      return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
    });
    els.forEach(function (el, i) {
      el.style.transitionDelay = (i * 80) + 'ms';
      el.classList.add('is-visible');
      el.addEventListener('transitionend', function done() {
        el.style.transitionDelay = '';
        el.removeEventListener('transitionend', done);
      });
    });
  }

  // Hero is always above the fold — reveal it right away, no observer needed.
  // Reading offsetHeight commits the initial hidden state so flipping the class
  // in the same tick still plays the transition (no rAF/observer dependency).
  var heroEls = [].slice.call(document.querySelectorAll('[data-hero]'));
  void document.body.offsetHeight;
  reveal(heroEls);

  // Scroll sections: reveal once as each enters the viewport.
  var io = new IntersectionObserver(function (entries, obs) {
    var batch = [];
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        batch.push(e.target);
        obs.unobserve(e.target);
      }
    });
    if (batch.length) reveal(batch);
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.1 });

  document.querySelectorAll('[data-reveal]').forEach(function (el) { io.observe(el); });

  /* ===================== Product-visual animations =====================
     Reached only when motion is allowed (reduced-motion returned early above).
     Each looping visual runs a start()/stop() pair tied to its on-screen
     state so nothing animates off-screen. */

  function whileVisible(el, start, stop) {
    if (!el) return;
    var running = false;
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && !running) { running = true; start(); }
        else if (!e.isIntersecting && running) { running = false; stop(); }
      });
    }, { threshold: 0.25 }).observe(el);
  }

  // 1 — Hero card leans slowly toward the cursor (max 60px per axis, smoothed).
  //     No idle motion — it only responds to the pointer. Waveform fill is CSS.
  var heroCard = document.querySelector('.audio-card');
  if (heroCard) {
    var mX = innerWidth / 2, mY = innerHeight / 2, curX = 0, curY = 0, hRaf = null;
    var onMove = function (e) { mX = e.clientX; mY = e.clientY; };
    var lean = function () {
      var r = heroCard.getBoundingClientRect();
      var baseCx = r.left + r.width / 2 - curX;          // resting centre (undo current offset)
      var baseCy = r.top + r.height / 2 - curY;
      var gx = Math.max(-1, Math.min(1, (mX - baseCx) / (innerWidth / 2))) * 60;
      var gy = Math.max(-1, Math.min(1, (mY - baseCy) / (innerHeight / 2))) * 60;
      curX += (gx - curX) * 0.08;                        // ease toward target
      curY += (gy - curY) * 0.08;
      heroCard.style.transform = 'translate3d(' + curX.toFixed(2) + 'px,' + curY.toFixed(2) + 'px,0)';
      hRaf = requestAnimationFrame(lean);
    };
    whileVisible(heroCard,
      function () { window.addEventListener('mousemove', onMove); hRaf = requestAnimationFrame(lean); },
      function () {
        window.removeEventListener('mousemove', onMove);
        if (hRaf) cancelAnimationFrame(hRaf);
        hRaf = null; curX = 0; curY = 0; heroCard.style.transform = '';
      });
  }

  // 2 — Step 1: shine sweep over note lines, then "12 fiszek…" pops in. Loop.
  var miniNote = document.querySelector('.mini-note');
  if (miniNote) {
    var s1 = [];
    var s1cycle = function () {
      miniNote.classList.remove('is-done');
      miniNote.classList.add('is-processing');
      s1.push(setTimeout(function () {
        miniNote.classList.remove('is-processing');
        miniNote.classList.add('is-done');
        s1.push(setTimeout(s1cycle, 2600));
      }, 2200));
    };
    whileVisible(miniNote,
      function () { s1cycle(); },
      function () { s1.forEach(clearTimeout); s1 = []; miniNote.classList.remove('is-processing'); });
  }

  // 3 — Step 2: cycle the selected repetition option, top to bottom, looping.
  var miniRep = document.querySelector('.mini-rep');
  if (miniRep) {
    var repRows = miniRep.querySelectorAll('.rep-row');
    var repIdx = 0, repInt = null;
    var repTick = function () {
      repRows.forEach(function (r, i) { r.classList.toggle('active', i === repIdx); });
      repIdx = (repIdx + 1) % repRows.length;
    };
    whileVisible(miniRep,
      function () { repIdx = 0; repTick(); repInt = setInterval(repTick, 1500); },
      function () { clearInterval(repInt); repRows.forEach(function (r) { r.classList.remove('active'); }); });
  }

  // 4 — Step 3: alternate Audio (waveform) and Klasyczne (text), looping.
  var miniModes = document.querySelector('.mini-modes');
  if (miniModes) {
    var miniWave = miniModes.querySelector('.mini-wave');
    if (miniWave) {
      for (var w = 0; w < 40; w++) {
        var wb = document.createElement('span');
        wb.style.animationDelay = (w * 0.05).toFixed(2) + 's';
        miniWave.appendChild(wb);
      }
    }
    var chips = miniModes.querySelectorAll('.mode');
    var audioOn = true, modeInt = null;
    var modeTick = function () {
      miniModes.classList.toggle('show-audio', audioOn);
      miniModes.classList.toggle('show-classic', !audioOn);
      chips.forEach(function (c) {
        c.classList.toggle('mode-active', (c.getAttribute('data-mode') === 'audio') === audioOn);
      });
      audioOn = !audioOn;
    };
    whileVisible(miniModes,
      function () { audioOn = true; modeTick(); modeInt = setInterval(modeTick, 3000); },
      function () { clearInterval(modeInt); });
  }

  // 5 — Grade card: each % counts up from 0; a passed row flips to
  //     "Zaliczone" the moment its counter reaches 20. Plays once on reveal.
  var pdfCard = document.querySelector('.pdf-card');
  if (pdfCard) {
    var pdfRows = [].slice.call(pdfCard.querySelectorAll('.pdf-row'));
    // Reset to 0 up front (card is below the fold) so there's no flash of the
    // final state before the count begins.
    pdfRows.forEach(function (r) {
      r.querySelector('.pct').textContent = '0 pkt';
      if (r.getAttribute('data-pass') === '1') {
        var b = r.querySelector('.badge');
        b.textContent = 'Do zrobienia';
        b.classList.remove('badge-success');
      }
    });
    var runCount = function () {
      var DUR = 1500, t0 = null;
      var step = function (t) {
        if (!t0) t0 = t;
        var p = Math.min((t - t0) / DUR, 1);
        var e = 1 - Math.pow(1 - p, 3);                 // easeOutCubic
        pdfRows.forEach(function (r) {
          var target = +r.getAttribute('data-count');
          var cur = Math.round(e * target);
          r.querySelector('.pct').textContent = cur + ' pkt';
          if (r.getAttribute('data-pass') === '1' && cur >= 20) {
            var b = r.querySelector('.badge');
            if (!b.classList.contains('badge-success')) {
              b.textContent = 'Zaliczone';
              b.classList.add('badge-success', 'badge-pop');
            }
          }
        });
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    var pdfDone = false;
    new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (e.isIntersecting && !pdfDone) { pdfDone = true; obs.disconnect(); runCount(); }
      });
    }, { threshold: 0.4 }).observe(pdfCard);
  }
})();
