const knex = require('knex');
const config = require('./index');
const knexConfig = require('./knexfile');

const environment = config.nodeEnv || 'development';
const db = knex(knexConfig[environment]);

module.exports = db;
