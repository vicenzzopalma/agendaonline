const path = require("node:path");

module.exports = {
  apps: [{
    name: "agenda-realess",
    cwd: __dirname,
    script: path.join(__dirname, "scripts", "selfhost", "start.mjs"),
    interpreter: process.execPath,
    instances: 1,
    exec_mode: "fork",
    env: { NODE_ENV: "production" },
  }],
};
