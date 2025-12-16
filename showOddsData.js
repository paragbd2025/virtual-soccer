const sqlite3 = require('sqlite3').verbose();

class OddsDataViewer {
    constructor() {
        this.db = null;
    }

    // Initialize the SQLite database
    async initialize() {
        try {
            console.log('Connecting to database...');
            this.db = new sqlite3.Database('./matches.db', (err) => {
                if (err) {
                    console.error('❌ Error connecting to database:', err.message);
                    return;
                }
                console.log('✅ Connected to database');
            });
        } catch (error) {
            console.error('❌ Initialization failed:', error.message);
        }
    }

    // Show odds data from the database
    async showOddsFromDatabase() {
        try {
            console.log('Fetching odds data from the database...');

            this.db.all("SELECT homeTeam, awayTeam, homeOdds, drawOdds, awayOdds FROM match_odds", [], (err, rows) => {
                if (err) {
                    console.error('❌ Error fetching odds data:', err.message);
                    return;
                }

                // Log the data in a tabular format in the console
                if (rows.length > 0) {
                    console.table(rows);
                } else {
                    console.log('ℹ️ No odds data found in the database.');
                }
            });
        } catch (error) {
            console.error('❌ Error displaying odds data:', error.message);
        }
    }

    // Close the database connection
    async closeDatabase() {
        try {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        console.error('❌ Error closing database:', err.message);
                    } else {
                        console.log('✅ Database connection closed');
                    }
                });
            }
        } catch (error) {
            console.error('❌ Error closing database:', error.message);
        }
    }
}

// Example usage
(async () => {
    const viewer = new OddsDataViewer();
    await viewer.initialize();
    await viewer.showOddsFromDatabase();
    await viewer.closeDatabase();
})();
