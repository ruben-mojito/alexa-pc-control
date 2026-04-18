'use strict';

require('dotenv').config();

const { connect } = require('./client');

console.log('[agent] Starting Alexa PC Control Agent...');
connect();
