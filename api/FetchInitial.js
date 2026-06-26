import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
    try {
        const sql = neon(process.env.DATABASE_URL);
        const results = await sql`SELECT * FROM satellites;`;
        return res.status(200).json(results);
    }
    catch (error) {
        console.error('FetchInitial: Error: \n', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}