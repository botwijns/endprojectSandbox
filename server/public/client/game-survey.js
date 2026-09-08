/*!
 * game-survey.js — renders the config-driven survey template and posts the
 * answers to the game server, linked to the current GameTelemetry session.
 *
 *   <link rel="stylesheet" href="http://localhost:3000/client/game-survey.css">
 *   <script src="http://localhost:3000/client/game-telemetry.js"></script>
 *   <script src="http://localhost:3000/client/game-survey.js"></script>
 *   <div id="survey"></div>
 *   <script>
 *     GameSurvey.mount('#survey', {
 *       onComplete: function () { location.href = '/thanks.html'; },
 *     });
 *   </script>
 *
 * Options for GameSurvey.mount(target, options):
 *   - onComplete(result, answers) : called after a successful submission
 *   - template                    : a survey template object to render directly,
 *                                   instead of fetching GET /api/survey/template
 *                                   (used by the GitHub Pages survey page, which
 *                                   bundles survey-template.json at build time)
 */
(function (global) {
  'use strict';

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') el.textContent = attrs[k];
      else if (k === 'html') el.innerHTML = attrs[k];
      else if (k in el) el[k] = attrs[k];
      else el.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (kid) {
      if (kid) el.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    });
    return el;
  }

  function labelText(q) {
    var span = h('span', { class: 'gs-label', text: q.label });
    if (q.required) span.appendChild(h('span', { class: 'gs-required', text: '*', 'aria-hidden': 'true' }));
    return span;
  }

  function renderQuestion(q) {
    var name = 'q_' + q.id;
    var wrap;

    if (q.type === 'single' || q.type === 'multi') {
      wrap = h('fieldset', { class: 'gs-q' });
      wrap.appendChild(h('legend', {}, [labelText(q)]));
      q.options.forEach(function (opt) {
        wrap.appendChild(
          h('label', { class: 'gs-option' }, [
            h('input', { type: q.type === 'single' ? 'radio' : 'checkbox', name: name, value: opt }),
            h('span', { text: opt }),
          ]),
        );
      });
    } else if (q.type === 'scale') {
      wrap = h('fieldset', { class: 'gs-q' });
      wrap.appendChild(h('legend', {}, [labelText(q)]));
      var row = h('div', { class: 'gs-scale' });
      if (q.minLabel) row.appendChild(h('span', { class: 'gs-scale-label', text: q.minLabel }));
      for (var n = q.min; n <= q.max; n++) {
        row.appendChild(
          h('label', {}, [
            h('input', { type: 'radio', name: name, value: String(n) }),
            h('span', { text: String(n) }),
          ]),
        );
      }
      if (q.maxLabel) row.appendChild(h('span', { class: 'gs-scale-label', text: q.maxLabel }));
      wrap.appendChild(row);
    } else if (q.type === 'boolean') {
      wrap = h('fieldset', { class: 'gs-q' });
      wrap.appendChild(h('legend', {}, [labelText(q)]));
      [['Ja', 'true'], ['Nee', 'false']].forEach(function (pair) {
        wrap.appendChild(
          h('label', { class: 'gs-option' }, [
            h('input', { type: 'radio', name: name, value: pair[1] }),
            h('span', { text: pair[0] }),
          ]),
        );
      });
    } else {
      // text
      wrap = h('div', { class: 'gs-q' });
      wrap.appendChild(h('label', { class: 'gs-label', htmlFor: name }, [labelText(q)]));
      wrap.appendChild(
        h('textarea', {
          id: name,
          name: name,
          maxLength: Number.isInteger(q.maxLength) ? q.maxLength : 2000,
          placeholder: q.placeholder || '',
        }),
      );
    }

    wrap.dataset.qid = q.id;
    wrap.dataset.qtype = q.type;
    return wrap;
  }

  function collect(form, template) {
    var answers = {};
    template.questions.forEach(function (q) {
      var name = 'q_' + q.id;
      if (q.type === 'single') {
        var picked = form.querySelector('input[name="' + name + '"]:checked');
        if (picked) answers[q.id] = picked.value;
      } else if (q.type === 'multi') {
        var checks = form.querySelectorAll('input[name="' + name + '"]:checked');
        if (checks.length) answers[q.id] = Array.prototype.map.call(checks, function (c) { return c.value; });
      } else if (q.type === 'scale') {
        var s = form.querySelector('input[name="' + name + '"]:checked');
        if (s) answers[q.id] = Number(s.value);
      } else if (q.type === 'boolean') {
        var b = form.querySelector('input[name="' + name + '"]:checked');
        if (b) answers[q.id] = b.value === 'true';
      } else {
        var ta = form.querySelector('[name="' + name + '"]');
        if (ta && ta.value.trim()) answers[q.id] = ta.value.trim();
      }
    });
    return answers;
  }

  function clearErrors(root) {
    root.querySelectorAll('.gs-field-error').forEach(function (n) { n.remove(); });
    var formErr = root.querySelector('.gs-form-error');
    if (formErr) formErr.remove();
  }

  function showFieldErrors(root, template, answers) {
    var firstBad = null;
    template.questions.forEach(function (q) {
      if (!q.required) return;
      var has = answers[q.id] !== undefined;
      if (!has) {
        var block = root.querySelector('[data-qid="' + q.id + '"]');
        if (block) {
          block.appendChild(h('div', { class: 'gs-field-error', text: 'Dit veld is verplicht.' }));
          if (!firstBad) firstBad = block;
        }
      }
    });
    if (firstBad) firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return !firstBad;
  }

  function mount(target, options) {
    var opts = options || {};
    var root = typeof target === 'string' ? document.querySelector(target) : target;
    if (!root) throw new Error('GameSurvey.mount: target not found');
    var T = global.GameTelemetry;
    if (!T) throw new Error('GameSurvey.mount: load game-telemetry.js first');

    root.classList.add('game-survey');
    root.innerHTML = '';
    root.appendChild(h('p', { class: 'gs-loading', text: 'Vragenlijst laden…' }));

    // opts.template: use a template supplied by the caller (e.g. a page that
    // bundled survey-template.json at build time) instead of fetching it.
    var templateSource = opts.template
      ? Promise.resolve(opts.template)
      : T.loadSurveyTemplate();

    return templateSource.then(function (template) {
      root.innerHTML = '';
      if (template.title) root.appendChild(h('h2', { text: template.title }));
      if (template.intro) root.appendChild(h('p', { class: 'gs-intro', text: template.intro }));

      var form = h('form', { novalidate: true });
      template.questions.forEach(function (q) { form.appendChild(renderQuestion(q)); });

      var submit = h('button', {
        type: 'submit',
        class: 'gs-submit',
        text: template.submitLabel || 'Versturen',
      });
      form.appendChild(submit);
      root.appendChild(form);

      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        clearErrors(root);
        var answers = collect(form, template);
        if (!showFieldErrors(root, template, answers)) return;

        submit.disabled = true;
        submit.textContent = 'Versturen…';

        T.submitSurvey(answers).then(
          function (result) {
            root.innerHTML = '';
            root.appendChild(
              h('p', { class: 'gs-done', text: template.thankYou || 'Bedankt, je antwoorden zijn opgeslagen.' }),
            );
            if (typeof opts.onComplete === 'function') opts.onComplete(result, answers);
          },
          function (err) {
            submit.disabled = false;
            submit.textContent = template.submitLabel || 'Versturen';
            var msg = 'Er ging iets mis bij het versturen. Probeer het opnieuw.';
            if (err && err.body && Array.isArray(err.body.errors)) msg = err.body.errors.join(' · ');
            form.appendChild(h('div', { class: 'gs-form-error', text: msg }));
          },
        );
      });

      return template;
    }, function () {
      root.innerHTML = '';
      root.appendChild(h('p', { class: 'gs-error', text: 'Kon de vragenlijst niet laden.' }));
    });
  }

  global.GameSurvey = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
