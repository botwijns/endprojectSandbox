/*!
 * game-telemetry.js — tiny client for the endproject-sandbox game server.
 *
 * Load it with a plain <script> tag (no build step needed):
 *
 *   <meta name="game-api-base" content="http://localhost:3000">
 *   <script src="http://localhost:3000/client/game-telemetry.js"></script>
 *
 * The API base is resolved in this order:
 *   1. GameTelemetry.setApiBase(...) / window.__GAME_API_BASE__
 *   2. <meta name="game-api-base" content="...">
 *   3. the origin this script was loaded from  (so the hosted survey page and
 *      any same-origin page work with no configuration)
 *
 * Then, anywhere in your game code:
 *
 *   await GameTelemetry.session();                    // create / resume a session
 *   GameTelemetry.recordProgress({                    // link data onto that session
 *     merge: { prototype_5: { completed: true, bestScore: 7 } },
 *     events: [{ prototype: 'prototype_5', type: 'complete', payload: { score: 7 } }],
 *   });
 *
 * The session id is generated server-side and cached in localStorage, so a
 * returning player keeps the same id and their data is merged, not duplicated.
 */
(function (global) {
  'use strict';

  var LS_KEY = 'egs_session_id';

  // Origin this very script was served from — the right default for the hosted
  // survey page and any page served by the game server itself.
  function scriptOrigin() {
    try {
      if (document.currentScript && document.currentScript.src) {
        return new URL(document.currentScript.src).origin;
      }
      var scripts = document.getElementsByTagName('script');
      for (var i = scripts.length - 1; i >= 0; i--) {
        if (scripts[i].src && /game-telemetry\.js/.test(scripts[i].src)) {
          return new URL(scripts[i].src).origin;
        }
      }
    } catch (e) { /* ignore */ }
    return global.location ? global.location.origin : 'http://localhost:3000';
  }

  function apiBase() {
    if (global.__GAME_API_BASE__) return String(global.__GAME_API_BASE__).replace(/\/$/, '');
    var meta = document.querySelector('meta[name="game-api-base"]');
    if (meta && meta.content) return meta.content.replace(/\/$/, '');
    return scriptOrigin().replace(/\/$/, '');
  }

  function readId() {
    try { return global.localStorage.getItem(LS_KEY); } catch (e) { return null; }
  }
  function writeId(id) {
    try { global.localStorage.setItem(LS_KEY, id); } catch (e) { /* private mode */ }
  }
  function forgetId() {
    try { global.localStorage.removeItem(LS_KEY); } catch (e) { /* ignore */ }
  }

  function request(path, options) {
    var opts = options || {};
    return fetch(apiBase() + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (res) {
      if (res.status === 204) return null;
      return res.text().then(function (text) {
        var data = text ? JSON.parse(text) : null;
        if (!res.ok) {
          var err = new Error((data && (data.message || data.error)) || res.statusText);
          err.status = res.status;
          err.body = data;
          throw err;
        }
        return data;
      });
    });
  }

  var sessionPromise = null;

  function createOrResume(metadata) {
    var existing = readId();
    var chain = Promise.resolve(null);

    if (existing) {
      chain = request('/api/sessions/' + encodeURIComponent(existing))
        .then(function (info) { return { id: existing, resumed: true, info: info }; })
        .catch(function (err) {
          if (err.status === 404 || err.status === 400) { forgetId(); return null; }
          throw err;
        });
    }

    return chain.then(function (resumed) {
      if (resumed) return resumed;
      return request('/api/sessions', {
        method: 'POST',
        body: { metadata: metadata || defaultMetadata() },
      }).then(function (created) {
        writeId(created.id);
        return { id: created.id, resumed: false, info: created };
      });
    });
  }

  function defaultMetadata() {
    // Coarse, non-identifying context only.
    var m = {};
    try {
      m.lang = navigator.language || null;
      m.viewport = window.innerWidth + 'x' + window.innerHeight;
      m.touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    } catch (e) { /* ignore */ }
    return m;
  }

  function session(metadata) {
    if (!sessionPromise) {
      sessionPromise = createOrResume(metadata).catch(function (err) {
        sessionPromise = null; // let a later call retry
        throw err;
      });
    }
    return sessionPromise;
  }

  function recordProgress(patch) {
    var p = patch || {};
    var events = Array.isArray(p.events) ? p.events : undefined;
    if (events && p.prototype) {
      events = events.map(function (ev) {
        return Object.assign({ prototype: p.prototype }, ev);
      });
    }
    return session().then(function (s) {
      return request('/api/sessions/' + encodeURIComponent(s.id) + '/progress', {
        method: 'POST',
        body: { merge: p.merge, events: events },
      });
    });
  }

  function loadSurveyTemplate() {
    return request('/api/survey/template');
  }

  function submitSurvey(answers) {
    return session().then(function (s) {
      return request('/api/sessions/' + encodeURIComponent(s.id) + '/survey', {
        method: 'POST',
        body: { answers: answers },
      });
    });
  }

  global.GameTelemetry = {
    session: session,
    recordProgress: recordProgress,
    loadSurveyTemplate: loadSurveyTemplate,
    submitSurvey: submitSurvey,
    getSessionId: readId,
    resetSession: function () { forgetId(); sessionPromise = null; },
    setApiBase: function (base) { global.__GAME_API_BASE__ = base; },
    _apiBase: apiBase,
  };
})(typeof window !== 'undefined' ? window : this);
