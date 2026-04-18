'use strict';

const Alexa = require('ask-sdk-core');
const axios = require('axios');

// ─── Configuration ────────────────────────────────────────────────────────────
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'change-me-in-production';
const DEFAULT_DEVICE_ID = process.env.DEFAULT_DEVICE_ID || 'my-pc';
const WOL_SERVICE_URL = process.env.WOL_SERVICE_URL || 'http://localhost:3001';
const DEFAULT_MAC = process.env.DEFAULT_MAC || '';

// ─── Helper: obtain a short-lived JWT ────────────────────────────────────────
async function getToken() {
  const res = await axios.post(`${SERVER_URL}/api/auth/token`, {
    apiKey: API_KEY,
    deviceId: DEFAULT_DEVICE_ID,
  });
  return res.data.token;
}

// ─── Helper: send a command to the PC agent ──────────────────────────────────
async function sendCommand(command, deviceId, delaySeconds = 0) {
  const token = await getToken();
  const res = await axios.post(
    `${SERVER_URL}/api/commands/${deviceId}`,
    { command, delaySeconds },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
}

// ─── Helper: send a WoL magic packet ─────────────────────────────────────────
async function wakeDevice(mac) {
  const token = await getToken();
  const res = await axios.post(
    `${WOL_SERVICE_URL}/wake`,
    { mac },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
}

// ─── Helper: list connected devices ──────────────────────────────────────────
async function listDevices() {
  const token = await getToken();
  const res = await axios.get(`${SERVER_URL}/api/devices`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

// ─── Intent Handlers ─────────────────────────────────────────────────────────

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    const speak = 'Welcome to PC Control. You can say shut down, reboot, wake up, or list my devices.';
    return handlerInput.responseBuilder
      .speak(speak)
      .reprompt(speak)
      .getResponse();
  },
};

const ShutdownIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'ShutdownIntent'
    );
  },
  async handle(handlerInput) {
    const slots = handlerInput.requestEnvelope.request.intent.slots || {};
    const deviceId = (slots.deviceName && slots.deviceName.value) || DEFAULT_DEVICE_ID;
    const delayMinutes = parseInt((slots.delayMinutes && slots.delayMinutes.value) || '0', 10);
    const delaySeconds = delayMinutes * 60;

    try {
      await sendCommand('shutdown', deviceId, delaySeconds);
      const speak = delayMinutes > 0
        ? `Shutting down ${deviceId} in ${delayMinutes} minutes.`
        : `Shutting down ${deviceId} now.`;
      return handlerInput.responseBuilder.speak(speak).getResponse();
    } catch (err) {
      console.error('[lambda] ShutdownIntent error:', err.message);
      return handlerInput.responseBuilder
        .speak(`Sorry, I could not shut down ${deviceId}. Please check that the device is online.`)
        .getResponse();
    }
  },
};

const RebootIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'RebootIntent'
    );
  },
  async handle(handlerInput) {
    const slots = handlerInput.requestEnvelope.request.intent.slots || {};
    const deviceId = (slots.deviceName && slots.deviceName.value) || DEFAULT_DEVICE_ID;

    try {
      await sendCommand('reboot', deviceId);
      return handlerInput.responseBuilder
        .speak(`Rebooting ${deviceId}.`)
        .getResponse();
    } catch (err) {
      console.error('[lambda] RebootIntent error:', err.message);
      return handlerInput.responseBuilder
        .speak(`Sorry, I could not reboot ${deviceId}.`)
        .getResponse();
    }
  },
};

const WakeIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'WakeIntent'
    );
  },
  async handle(handlerInput) {
    const slots = handlerInput.requestEnvelope.request.intent.slots || {};
    const deviceId = (slots.deviceName && slots.deviceName.value) || DEFAULT_DEVICE_ID;

    if (!DEFAULT_MAC) {
      return handlerInput.responseBuilder
        .speak('Wake on LAN is not configured. Please set the DEFAULT_MAC environment variable.')
        .getResponse();
    }

    try {
      await wakeDevice(DEFAULT_MAC);
      return handlerInput.responseBuilder
        .speak(`Sending wake-up signal to ${deviceId}.`)
        .getResponse();
    } catch (err) {
      console.error('[lambda] WakeIntent error:', err.message);
      return handlerInput.responseBuilder
        .speak(`Sorry, I could not wake up ${deviceId}.`)
        .getResponse();
    }
  },
};

const PingIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'PingIntent'
    );
  },
  async handle(handlerInput) {
    const slots = handlerInput.requestEnvelope.request.intent.slots || {};
    const deviceId = (slots.deviceName && slots.deviceName.value) || DEFAULT_DEVICE_ID;

    try {
      await sendCommand('ping', deviceId);
      return handlerInput.responseBuilder
        .speak(`${deviceId} is online.`)
        .getResponse();
    } catch (err) {
      console.error('[lambda] PingIntent error:', err.message);
      return handlerInput.responseBuilder
        .speak(`${deviceId} does not appear to be online.`)
        .getResponse();
    }
  },
};

const ListDevicesIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'ListDevicesIntent'
    );
  },
  async handle(handlerInput) {
    try {
      const devices = await listDevices();
      if (!devices.length) {
        return handlerInput.responseBuilder
          .speak('No devices are currently connected.')
          .getResponse();
      }
      const names = devices.map((d) => d.name || d.deviceId).join(', ');
      return handlerInput.responseBuilder
        .speak(`The following devices are connected: ${names}.`)
        .getResponse();
    } catch (err) {
      console.error('[lambda] ListDevicesIntent error:', err.message);
      return handlerInput.responseBuilder
        .speak('Sorry, I could not retrieve the device list.')
        .getResponse();
    }
  },
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent'
    );
  },
  handle(handlerInput) {
    const speak =
      'You can say: shut down my computer, wake up my PC, reboot, ping my PC, or list my devices.';
    return handlerInput.responseBuilder.speak(speak).reprompt(speak).getResponse();
  },
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      ['AMAZON.CancelIntent', 'AMAZON.StopIntent'].includes(
        Alexa.getIntentName(handlerInput.requestEnvelope)
      )
    );
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.speak('Goodbye!').getResponse();
  },
};

const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent'
    );
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak("Sorry, I didn't understand that. You can say shut down, reboot, wake up, or list my devices.")
      .reprompt('What would you like to do?')
      .getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  // eslint-disable-next-line no-unused-vars
  handle(_handlerInput) {
    return {};
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.error('[lambda] Error:', error.message);
    return handlerInput.responseBuilder
      .speak('Sorry, something went wrong. Please try again.')
      .getResponse();
  },
};

// ─── Skill builder ────────────────────────────────────────────────────────────
const skill = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    ShutdownIntentHandler,
    RebootIntentHandler,
    WakeIntentHandler,
    PingIntentHandler,
    ListDevicesIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .create();

exports.handler = async (event, context) => skill.invoke(event, context);
