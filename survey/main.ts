// Standalone survey page for GitHub Pages.
//
// It renders the SAME survey template the server validates against — imported
// here at build time so there is a single source of truth — and submits the
// answers to the game server, linked to the player's GameTelemetry session.

// Single source of truth, shared with server/src/survey.js (which reads it at runtime).
import surveyTemplate from '../server/survey-template.json';

// Renderer + telemetry client, shared with the server-hosted survey page
// (server/public/client/*). Imported for their side effect of defining the
// window.GameTelemetry / window.GameSurvey globals.
import '../server/public/client/game-telemetry.js';
import '../server/public/client/game-survey.js';
import '../server/public/client/game-survey.css';

import './style.css';

declare global {
  interface Window {
    GameTelemetry: {
      setApiBase(base: string): void;
      [key: string]: unknown;
    };
    GameSurvey: {
      mount(
        target: string | Element,
        options: {
          template?: unknown;
          onComplete?: (result: unknown, answers: Record<string, unknown>) => void;
        },
      ): Promise<unknown>;
    };
  }
}

const params = new URLSearchParams(location.search);

// ?api=https://your-server  overrides the <meta name="game-api-base"> tag.
const apiOverride = params.get('api');
if (apiOverride) window.GameTelemetry.setApiBase(apiOverride);

window.GameSurvey.mount('#survey', {
  template: surveyTemplate,
  onComplete() {
    // ?next=<url>  sends the player onward after the thank-you message.
    const next = params.get('next');
    if (next) {
      setTimeout(() => {
        location.href = next;
      }, 1200);
    }
  },
});
