import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
        const id = req.body["id"];

        let query = `SELECT * FROM satellites where norad_id = ${id}`;

        // Fetch data
        console.log('FetchDetails: Fetching data with query: \n', `"${query}"`);
        const sql = neon(process.env.DATABASE_URL);
        const results = await sql`${sql.unsafe(query)}`;
        console.log(`FetchDetails: Fetched ${results.length} records from database`);

        return res.status(200).json(results[0]);
    }
    catch (error) {
        console.error('FetchDetails: Error: \n', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}