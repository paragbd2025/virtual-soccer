// testDb.js - Test database connection and data
const sqlite3 = require('sqlite3').verbose();

async function testDatabase() {
    const db = new sqlite3.Database('./virtual_football_betting.db');

    console.log('\n🔍 TESTING DATABASE');
    console.log('='.repeat(70));

    try {
        // Test 1: Check all tables
        console.log('\n1. Checking tables...');
        const tables = await query(db, `
            SELECT name FROM sqlite_master
            WHERE type='table'
            ORDER BY name
        `);

        console.log('   Tables found:');
        tables.forEach(table => {
            console.log(`   - ${table.name}`);
        });

        // Test 2: Check counts
        console.log('\n2. Record counts:');
        for (const table of tables) {
            try {
                const count = await query(db, `SELECT COUNT(*) as count FROM ${table.name}`);
                console.log(`   ${table.name}: ${count[0].count} records`);
            } catch (e) {
                console.log(`   ${table.name}: Error - ${e.message}`);
            }
        }

        // Test 3: Check matches data
        console.log('\n3. Matches data sample:');
        const matches = await query(db, `
            SELECT * FROM matches
            ORDER BY created_at DESC
                LIMIT 5
        `);

        if (matches.length === 0) {
            console.log('   No matches found in database');
            console.log('   Possible issue: matches not being saved');
        } else {
            console.log('   Recent matches:');
            matches.forEach(match => {
                console.log(`   - Match ID: ${match.match_id}, Status: ${match.status}`);
            });
        }

        // Test 4: Check tournament stages
        console.log('\n4. Tournament stages:');
        const stages = await query(db, `SELECT * FROM tournament_stages ORDER BY stage_name`);
        stages.forEach(stage => {
            console.log(`   - ${stage.stage_name} (ID: ${stage.stage_id})`);
        });

        // Test 5: Check teams
        console.log('\n5. Teams in database:');
        const teams = await query(db, `SELECT * FROM teams ORDER BY team_name`);
        teams.forEach(team => {
            console.log(`   - ${team.team_name} (ID: ${team.team_id})`);
        });

        // Test 6: Check if any data is being saved
        console.log('\n6. Data collection status:');
        const totalRecords = await query(db, `
            SELECT
                    (SELECT COUNT(*) FROM tournament_stages) as stages,
                    (SELECT COUNT(*) FROM teams) as teams,
                    (SELECT COUNT(*) FROM matches) as matches,
                    (SELECT COUNT(*) FROM betting_odds) as odds
        `);

        console.log(`   Tournament Stages: ${totalRecords[0].stages}`);
        console.log(`   Teams: ${totalRecords[0].teams}`);
        console.log(`   Matches: ${totalRecords[0].matches}`);
        console.log(`   Betting Odds: ${totalRecords[0].odds}`);

        if (totalRecords[0].matches === 0) {
            console.log('\n⚠️  WARNING: No matches in database!');
            console.log('   The scraper is collecting data but not saving to new database.');
            console.log('   Check the saveMatch function in database.js');
        } else {
            console.log('\n✅ Database is working and collecting data!');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        db.close();
    }
}

function query(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

testDatabase();