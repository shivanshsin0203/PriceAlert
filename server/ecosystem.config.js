// PM2 — two processes: API + worker (ARCHITECTURE.md §5, §2 process model).
module.exports = {
  apps: [
    { name: "alert-api", script: "dist/server.js", instances: 1, env: { NODE_ENV: "production" } },
    { name: "alert-worker", script: "dist/worker.js", instances: 1, env: { NODE_ENV: "production" } },
  ],
};
