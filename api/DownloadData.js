import { put } from '@vercel/blob';
import { GetCookie } from './SessionCookie.js';

export const config = {
    runtime: 'edge',
};

const ChunkUrl = 'https://www.space-track.org/basicspacedata/query/class/gp/format/json';

export default async function handler(request) {
    const auth = request.headers.get('Authorization');
    if (!auth || auth != 'Bearer ' + process.env.CronSecret) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        const cookie = await GetCookie();
        if (!cookie)
            throw new Error('Failed to obtain cookie');
        
        const resp = await fetch(ChunkUrl, { headers: { 'Cookie': cookie } });
        const data = await resp.json();
        return new Response(JSON.stringify(data), { status: 200 });
    }
    catch (error) {
        console.error('Error in DownloadData handler:', error);
        return new Response('Internal Server Error', { status: 500 });
    }
}