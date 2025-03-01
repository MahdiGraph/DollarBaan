module.exports = {
  apps: [{
    name: "DollarBaan",
    script: "./app.js",
    instances: 1,
    exec_mode: "cluster",
    watch: false,
    env_production: {
      NODE_ENV: "production"
    }
  }]
};
