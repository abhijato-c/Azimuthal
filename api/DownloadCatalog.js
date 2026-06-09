import { neon } from '@neondatabase/serverless';
import { GetCookie } from '../helpers/SessionCookie.js';

export const config = {
    runtime: 'nodejs',
    maxDuration: 300
};

const ChunkUrl = 'https://www.space-track.org/basicspacedata/query/class/gp/DECAY_DATE/null-val/OBJECT_TYPE/PAYLOAD/format/json';

export default async function handler(req, res) {
    // Ensure the request is from cron
    const auth = req.headers['authorization'];
    if (!auth || auth != 'Bearer ' + process.env.CronSecret) return res.status(401).send('Unauthorized');

    try {
        // Fetch cookie
        var cookie = await GetCookie();
        if (!cookie) throw new Error('Failed to obtain cookie');

        // Fetch Data
        const resp = await fetch(ChunkUrl, { headers: { 'Cookie': cookie } });
        console.log(`Response from Space-Track, status: ${resp.status} : ${resp.statusText}`);

        console.time('Space-Track Body Download & Parse');
        const data = await resp.json();
        console.timeEnd('Space-Track Body Download & Parse');
        console.log(`Received ${data.length} records from Space-Track`);
        
        // Initialize db
        console.log('Initializing db');
        const sql = neon(process.env.DATABASE_URL);
        await sql`
            CREATE TABLE IF NOT EXISTS satellites (
                norad_id INT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                intl_designator VARCHAR(50),
                country VARCHAR(10),
                launch_date DATE,
                launch_site VARCHAR(15),
                inclination REAL,
                eccentricity REAL,
                period REAL,
                apoapsis REAL,
                periapsis REAL,
                tle_line1 CHAR(69) NOT NULL,
                tle_line2 CHAR(69) NOT NULL,
                epoch TIMESTAMP WITH TIME ZONE
            );
        `;

        // Filtering indexes
        console.log('Creating indexes');
        await sql`CREATE INDEX IF NOT EXISTS idx_satellites_name ON satellites (name);`;
        await sql`CREATE INDEX IF NOT EXISTS idx_satellites_country ON satellites (country);`;
        await sql`CREATE INDEX IF NOT EXISTS idx_satellites_intl_designator ON satellites (intl_designator);`;
        await sql`CREATE INDEX IF NOT EXISTS idx_satellites_launch_date ON satellites (launch_date);`;
        await sql`CREATE INDEX IF NOT EXISTS idx_satellites_launch_site ON satellites (launch_site);`;

        // Refine data
        console.log('Refining data and uploading');

        const BatchSize = 1000;
        for (let i = 0; i < data.length; i += BatchSize) {
            const chunk = data.slice(i, i + BatchSize);

            const NoradIds = [];
            const Names = [];
            const IntlDesignators = [];
            const Countries = [];
            const LaunchDates = [];
            const LaunchSites = [];
            const Epochs = [];
            const Inclinations = [];
            const Eccentricities = [];
            const Periods = [];
            const ApoapsisVals = [];
            const PeriapsisVals = [];
            const Tle1s = [];
            const Tle2s = [];
            
            for (const sat of chunk) {
                NoradIds.push(parseInt(sat.NORAD_CAT_ID, 10));
                Names.push(sat.OBJECT_NAME || 'UNKNOWN');
                IntlDesignators.push(sat.OBJECT_ID || null);
                Countries.push(sat.COUNTRY_CODE || null);
                LaunchSites.push(sat.SITE || null);
                LaunchDates.push(sat.LAUNCH_DATE ? sat.LAUNCH_DATE : null);
                Epochs.push(sat.EPOCH ? new Date(sat.EPOCH + 'Z').toISOString() : null);
                
                Inclinations.push(parseFloat(sat.INCLINATION) || 0.0);
                Eccentricities.push(parseFloat(sat.ECCENTRICITY) || 0.0);
                Periods.push(parseFloat(sat.PERIOD) || 0.0);
                ApoapsisVals.push(parseFloat(sat.APOAPSIS) || 0.0);
                PeriapsisVals.push(parseFloat(sat.PERIAPSIS) || 0.0);
                
                Tle1s.push(sat.TLE_LINE1);
                Tle2s.push(sat.TLE_LINE2);
            }

            await sql`
                INSERT INTO satellites (
                    norad_id, name, intl_designator, country, launch_date, launch_site,
                    inclination, eccentricity, period, apoapsis, periapsis, tle_line1, tle_line2, epoch
                )
                SELECT * FROM UNNEST(
                    ${NoradIds}::INT[], 
                    ${Names}::VARCHAR[], 
                    ${IntlDesignators}::VARCHAR[], 
                    ${Countries}::VARCHAR[], 
                    ${LaunchDates}::DATE[], 
                    ${LaunchSites}::VARCHAR[], 
                    ${Inclinations}::REAL[], 
                    ${Eccentricities}::REAL[], 
                    ${Periods}::REAL[], 
                    ${ApoapsisVals}::REAL[], 
                    ${PeriapsisVals}::REAL[], 
                    ${Tle1s}::CHAR(69)[], 
                    ${Tle2s}::CHAR(69)[],
                    ${Epochs}::TIMESTAMP WITH TIME ZONE[]
                )
                ON CONFLICT (norad_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    intl_designator = EXCLUDED.intl_designator,
                    country = EXCLUDED.country,
                    launch_date = EXCLUDED.launch_date,
                    launch_site = EXCLUDED.launch_site,
                    inclination = EXCLUDED.inclination,
                    eccentricity = EXCLUDED.eccentricity,
                    period = EXCLUDED.period,
                    apoapsis = EXCLUDED.apoapsis,
                    periapsis = EXCLUDED.periapsis,
                    tle_line1 = EXCLUDED.tle_line1,
                    tle_line2 = EXCLUDED.tle_line2,
                    epoch = EXCLUDED.epoch;
            `;
        }

        console.log('Data upload complete');
        return res.status(200).send('200');
    }
    catch (error) {
        console.error('Error in DownloadData handler:', error);
        return res.status(500).send('Internal Server Error');
    }
}