const knex = require('knex');
const config = require('./index');
const knexConfig = require('./knexfile');

const environment = config.nodeEnv || 'development';
let db;
try {
  db = knex(knexConfig[environment]);
} catch (err) {
  console.warn('[AI Studio] Database not connected — using in-memory mock stub:', err.message);
  const createChain = () => {
    const chain = Promise.resolve([]);
    const methods = ['select', 'where', 'whereIn', 'andWhere', 'orWhere', 'join', 'leftJoin', 'orderBy', 'limit', 'offset', 'groupBy', 'count', 'insert', 'update', 'del', 'delete', 'returning'];
    methods.forEach((m) => {
      chain[m] = () => chain;
    });
    chain.first = async () => null;
    chain.pluck = async () => [];
    return chain;
  };
  db = Object.assign(() => createChain(), {
    raw: async () => ({ rows: [] }),
    transaction: async (cb) => cb(db),
    destroy: async () => {},
  });
}

module.exports = db;
