'use strict';

const CAPABILITY_UNAVAILABLE_MESSAGE = "I'm not able to complete that action right now \u2014 it looks like the Projectworks connection isn't available. You can check the connection status in Settings, or try again in a moment.";

function executeAction() {
  return {
    ok: false,
    code: 'CAPABILITY_UNAVAILABLE',
    userMessage: CAPABILITY_UNAVAILABLE_MESSAGE,
  };
}

module.exports = {
  CAPABILITY_UNAVAILABLE_MESSAGE,
  executeAction,
};
