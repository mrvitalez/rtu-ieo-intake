/*
 * Local test server: serves /docs and stands in for both Apps Script web apps,
 * running the real .gs code against the in-memory mock.
 *   /             the public site, with config.js pointed at /exec
 *   /exec         the intake endpoint (doGet / doPost)
 *   /panel        the staff panel page (?as=email chooses the signed in account)
 *   /gas/<fn>     google.script.run calls from the panel
 * Usage: node tests/server.js [port]
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { makeWorld, loadProject } = require('./gas-mock');

function start(port) {
  const ROOT = path.join(__dirname, '..');
  const world = makeWorld();
  const intake = loadProject(path.join(ROOT, 'apps-script/intake'), world);
  const staff = loadProject(path.join(ROOT, 'apps-script/staff-panel'), world);
  const sheetId = intake.ctx.setup();
  const base = 'http://localhost:' + port + '/';
  Object.assign(staff.props, { SHEET_ID: sheetId, STAFF_EMAILS: 'case.manager@rtu.edu.ph', SITE_URL: base });

  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
  const shim = '<script>window.google={script:{get run(){var ok=function(){},bad=function(e){console.error(e)};var p=new Proxy({},{get:function(_,fn){' +
    'if(fn==="withSuccessHandler")return function(f){ok=f;return p};if(fn==="withFailureHandler")return function(f){bad=f;return p};' +
    'return function(){var a=[].slice.call(arguments);fetch("/gas/"+fn+location.search,{method:"POST",body:JSON.stringify(a)}).then(function(r){return r.json()}).then(function(j){j.error?bad(new Error(j.error)):ok(j.result)})}}});return p}}};</script>';

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, base);
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const send = (code, type, data) => { res.writeHead(code, { 'Content-Type': type }); res.end(data); };
      try {
        if (url.pathname === '/exec') {
          const out = req.method === 'POST'
            ? intake.ctx.doPost({ postData: { contents: body } })
            : intake.ctx.doGet({ parameter: Object.fromEntries(url.searchParams) });
          return send(200, 'application/json', out.getContent());
        }
        if (url.pathname === '/panel' || url.pathname.startsWith('/gas/')) {
          staff.user.email = url.searchParams.get('as') || 'case.manager@rtu.edu.ph';
        }
        if (url.pathname === '/panel') {
          return send(200, 'text/html; charset=utf-8', staff.ctx.doGet().getContent().replace('<head>', '<head>' + shim));
        }
        if (url.pathname.startsWith('/gas/')) {
          const fn = url.pathname.slice(5);
          if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(fn) || typeof staff.ctx[fn] !== 'function') return send(404, 'application/json', '{"error":"no such function"}');
          try {
            const result = staff.ctx[fn].apply(null, JSON.parse(body || '[]'));
            return send(200, 'application/json', JSON.stringify({ result: result === undefined ? null : JSON.parse(JSON.stringify(result)) }));
          } catch (e) { return send(200, 'application/json', JSON.stringify({ error: e.message })); }
        }
        if (url.pathname === '/assets/js/config.js') {
          return send(200, 'text/javascript', "window.IEO_CONFIG = { ENDPOINT_URL: '" + base + "exec' };");
        }
        const p = path.normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[\/\\])+/, '');
        const file = path.join(ROOT, 'docs', p);
        if (!file.startsWith(path.join(ROOT, 'docs')) || !fs.existsSync(file)) return send(404, 'text/plain', 'not found');
        send(200, types[path.extname(file)] || 'application/octet-stream', fs.readFileSync(file));
      } catch (e) { send(500, 'text/plain', String(e && e.stack || e)); }
    });
  });
  return new Promise(r => server.listen(port, () => r({ server, intake, staff, world, sheetId })));
}

module.exports = { start };
if (require.main === module) start(Number(process.argv[2] || 8765)).then(() => console.log('http://localhost:' + (process.argv[2] || 8765)));
