// users.js — users-specific routes are handled inside patients.js
// This file exists so server.js can mount both /users and /patients
// without breaking the existing route structure.

const { router } = require('./patients');
module.exports = { router };