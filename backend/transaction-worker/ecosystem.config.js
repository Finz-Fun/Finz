module.exports = {
    apps: [{
      name: "transaction-producer",
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      watch: false
    }, {
      name: "price-worker",
      script: "dist/workers/priceUpdateWorker.js",
      instances: 1,
      exec_mode: "fork",
      watch: false
    }, {
      name: "transaction-worker",
      script: "dist/workers/transactionUpdateWorker.js",
      instances: 1,
      exec_mode: "fork",
      watch: false
    }]
  };