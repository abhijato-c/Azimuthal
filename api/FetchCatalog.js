import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
        const filters = req.body["filters"];

        // Build query with filters
        let query = 'SELECT norad_id FROM satellites';
        if (Object.keys(filters).length > 0) {
            query += ' WHERE';
            if (filters.Country) {
                const InList = filters.Country.map(c => `'${c}'`).join(', ');
                query += ` country IN (${InList}) AND`;
            }
            if (filters.Site) {
                const InList = filters.Site.map(s => `'${s}'`).join(', ');
                query += ` launch_site IN (${InList}) AND`;
            }
            if (filters.Date) {
                query += ` launch_date BETWEEN '${filters.Date[0]}' AND '${filters.Date[1]}' AND`;
            }
        }

        // Remove trailing AND
        if (query.endsWith(' AND')) query = query.slice(0, -4);
        query += ';';

        // Fetch data
        console.log('FetchCatalog: Fetching data with query: \n', `"${query}"`);
        const sql = neon(process.env.DATABASE_URL);
        const results = await sql`${sql.unsafe(query)}`;
        console.log(`FetchCatalog: Fetched ${results.length} records from database`);

        return res.status(200).json(results.map(sat => sat.norad_id));
    }
    catch (error) {
        console.error('FetchCatalog: Error: \n', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}