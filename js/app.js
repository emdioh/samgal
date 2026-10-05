(function () {
  var $ = function (id) { return document.getElementById(id); };
  var KEYS = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 10009, PLAY: 415, PAUSE: 19, STOP: 413 };

  var cfg = load();
  var source = null, photos = [], index = -1, timer = null, paused = false;
  var front = $('a'), back = $('b');

  function load() {
    try { return JSON.parse(localStorage.getItem('samgal') || '{}'); } catch (e) { return {}; }
  }
  function status(msg) { $('status').textContent = msg || ''; }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---- menu ----
  function showMenu() {
    stopTimer();
    $('url').value = cfg.url || '';
    $('key').value = cfg.key || '';
    $('interval').value = cfg.interval || 10;
    $('menu').classList.remove('hidden');
    $('url').focus();
  }
  function hideMenu() { $('menu').classList.add('hidden'); }
  function menuOpen() { return !$('menu').classList.contains('hidden'); }

  function loadAlbums() {
    var s = new ImmichSource($('url').value.trim(), $('key').value.trim());
    status('Loading albums…');
    return s.listAlbums().then(function (albums) {
      var sel = $('album');
      sel.length = 1;
      albums.forEach(function (a) { sel.add(new Option(a.name, a.id)); });
      sel.value = cfg.album || '';
      status(albums.length + ' albums found');
    }).catch(function (e) { status('Failed: ' + e.message); });
  }

  // ---- diagnostics ----
  function diagOpen() { return !$('diagpage').classList.contains('hidden'); }
  function closeDiag() {
    $('diagpage').classList.add('hidden');
    $('menu').style.display = '';
    $('diag').focus();
  }
  function runDiag() {
    var box = $('diagrows');
    box.innerHTML = '';
    $('menu').style.display = 'none'; // z-index stacking is unreliable on some Tizen engines
    $('diagpage').classList.remove('hidden');
    $('diagclose').focus();
    runDiagnostics($('url').value.trim(), $('key').value.trim(), function (r) {
      var d = document.createElement('div');
      d.className = 'drow ' + r.state;
      var n = document.createElement('b');
      n.textContent = (r.state === 'pass' ? 'PASS ' : r.state === 'fail' ? 'FAIL ' : '') + r.name;
      var t = document.createElement('span');
      t.textContent = r.detail;
      d.appendChild(n); d.appendChild(t);
      box.appendChild(d);
    }).then(function () {
      var d = document.createElement('div'); d.className = 'drow info'; d.textContent = 'Done.';
      box.appendChild(d);
    });
  }

  function saveAndStart() {
    cfg = {
      url: $('url').value.trim(), key: $('key').value.trim(),
      album: $('album').value, interval: Math.max(3, parseInt($('interval').value, 10) || 10)
    };
    localStorage.setItem('samgal', JSON.stringify(cfg));
    start();
  }

  // ---- slideshow ----
  function start() {
    if (!cfg.url || !cfg.key) return showMenu();
    source = new ImmichSource(cfg.url, cfg.key);
    status('Loading photos…');
    source.listPhotos(cfg.album).then(function (list) {
      if (!list.length) { status('No photos found'); return showMenu(); }
      photos = shuffle(list); index = -1; paused = false;
      hideMenu();
      step(1);
    }).catch(function (e) { showMenu(); status('Failed: ' + e.message); });
  }

  function stopTimer() { clearTimeout(timer); timer = null; }

  function step(dir) {
    stopTimer();
    if (!photos.length) return;
    index = (index + dir + photos.length) % photos.length;
    var photo = photos[index];
    source.loadImage(photo).then(function (url) {
      var old = back.src;
      back.onload = function () {
        back.classList.add('show');
        front.classList.remove('show');
        var t = front; front = back; back = t;
        $('caption').textContent = photo.caption;
        if (old.indexOf('blob:') === 0) setTimeout(function () { URL.revokeObjectURL(old); }, 2000);
        schedule();
      };
      back.onerror = function () { step(dir); }; // skip broken image
      back.src = url;
    }).catch(function () { timer = setTimeout(function () { step(dir); }, 2000); });
  }

  function schedule() {
    stopTimer();
    if (!paused) timer = setTimeout(function () { step(1); }, cfg.interval * 1000);
  }

  // ---- input ----
  function exitApp() {
    try { tizen.application.getCurrentApplication().exit(); } catch (e) { window.close(); }
  }

  document.addEventListener('keydown', function (e) {
    if (diagOpen()) {
      if (e.keyCode === KEYS.BACK) closeDiag();
      return;
    }
    if (menuOpen()) {
      if (e.keyCode === KEYS.BACK) { if (photos.length) { hideMenu(); schedule(); } else exitApp(); }
      else if (e.keyCode === KEYS.UP || e.keyCode === KEYS.DOWN) {
        // Tizen has no spatial navigation inside focused inputs, so move focus by hand.
        var items = Array.prototype.slice.call($('menu').querySelectorAll('input, select, button'));
        var i = items.indexOf(document.activeElement);
        var next = items[Math.max(0, Math.min(items.length - 1, i + (e.keyCode === KEYS.DOWN ? 1 : -1)))];
        if (next) next.focus();
        e.preventDefault();
      }
      return; // let the focused control handle everything else
    }
    switch (e.keyCode) {
      case KEYS.RIGHT: step(1); break;
      case KEYS.LEFT: step(-1); break;
      case KEYS.OK: paused = true; showMenu(); break;
      case KEYS.PLAY: paused = false; schedule(); break;
      case KEYS.PAUSE: paused = true; stopTimer(); break;
      case KEYS.BACK: case KEYS.STOP: exitApp(); break;
    }
  });

  $('load').onclick = loadAlbums;
  $('save').onclick = saveAndStart;
  $('diag').onclick = runDiag;
  $('diagclose').onclick = closeDiag;

  // Register remote keys and keep the screen awake while running.
  try {
    ['MediaPlay', 'MediaPause', 'MediaStop'].forEach(function (k) { tizen.tvinputdevice.registerKey(k); });
    webapis.appcommon.setScreenSaver(webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF);
  } catch (e) { /* not on a TV */ }

  if (cfg.url && cfg.key) start(); else showMenu();
})();
