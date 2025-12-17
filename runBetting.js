// runBetting.js - Start the betting management system
const BettingManager = require('./bettingManager');

(async () => {
    const manager = new BettingManager();
    await manager.start();
})();