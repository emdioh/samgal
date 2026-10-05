// Connectivity diagnostics, run from the TV's own browser engine.
// runDiagnostics(url, key, onRow) -> Promise; onRow({name, state: 'pass'|'fail'|'info', detail}) fires per check.
var REACH_TARGET = 'http://192.168.2.10:81';

function runDiagnostics(url, key, onRow) {
  var TIMEOUT = 8000;
  var base = url.replace(/\/+$/, '');
  var m = /^(https?):\/\/([^\/:]+)(?::(\d+))?/i.exec(base);

  // Resolves {ok, status, type, ms, err}; never rejects.
  function probe(target, opts) {
    var t0 = Date.now();
    var done = function (r) { r.ms = Date.now() - t0; return r; };
    var req = fetch(target, opts).then(function (r) {
      return { ok: true, status: r.status, type: r.type };
    }, function (e) { return { ok: false, err: String(e && e.message || e) }; });
    var timeout = new Promise(function (res) {
      setTimeout(function () { res({ ok: false, err: 'timeout after ' + TIMEOUT / 1000 + 's' }); }, TIMEOUT);
    });
    return Promise.race([req, timeout]).then(done);
  }

  var rows = [];
  function emit(name, state, detail) {
    var r = { name: name, state: state, detail: detail };
    rows.push(r);
    onRow(r);
  }
  function show(r) {
    return r.ok ? 'HTTP ' + (r.type === 'opaque' ? '(opaque, reachable)' : r.status) + ' in ' + r.ms + ' ms'
                : r.err + ' (' + r.ms + ' ms)';
  }
  function check(name, target, opts, okFn) {
    return function () {
      return probe(target, opts).then(function (r) {
        emit(name, (okFn ? okFn(r) : r.ok) ? 'pass' : 'fail', target.replace(/^https?:\/\//, '') + ' -> ' + show(r));
      });
    };
  }

  var steps = [];
  var ping = base + '/api/server/ping';
  steps.push(function () {
    emit('Page origin', 'info', location.origin);
    emit('Browser', 'info', navigator.userAgent);
    emit('navigator.onLine', 'info', String(navigator.onLine));
    emit('Configured URL', m ? 'info' : 'fail', base || '(empty)');
    return Promise.resolve();
  });
  if (m) {
    var host = m[2];
    steps.push(check('1. Configured server reachable (no-cors)', ping, { mode: 'no-cors' }));
    steps.push(check('2. Same host over plain http, port 80 (no-cors)', 'http://' + host + '/api/server/ping', { mode: 'no-cors' }));
    steps.push(check('3. CORS: simple GET', ping, { mode: 'cors' }));
    steps.push(check('4. CORS: preflight with x-api-key (dummy key)', ping,
      { mode: 'cors', headers: { 'x-api-key': 'diagnostic-dummy' } }));
    steps.push(check('5. Real request: GET /api/albums with your key', base + '/api/albums',
      { mode: 'cors', headers: { 'x-api-key': key, Accept: 'application/json' } },
      function (r) { return r.ok && r.status === 200; }));
  }
  steps.push(check('6. Reachability target ' + REACH_TARGET + ' (no-cors)', REACH_TARGET + '/', { mode: 'no-cors' }));

  return steps.reduce(function (p, s) { return p.then(s); }, Promise.resolve()).then(function () {
    return rows;
  });
}
