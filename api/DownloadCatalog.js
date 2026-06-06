import { put } from '@vercel/blob';
import { GetCookie } from '../helpers/SessionCookie.js';

export const config = {
    runtime: 'edge',
};

const ChunkUrl = 'https://www.space-track.org/basicspacedata/query/class/gp/format/json';
const ReqdCols = ['NORAD_CAT_ID', 'OBJECT_NAME', 'OBJECT_ID', 'EPOCH', 'COUNTRY_CODE', 'LAUNCH_DATE', 'SITE', 'RCS_SIZE', 'INCLINATION', 'ECCENTRICITY', 'PERIOD', 'APOAPSIS', 'PERIAPSIS', 'TLE_LINE1', 'TLE_LINE2'];

export default async function handler(request) {
    const auth = request.headers.get('Authorization');
    if (!auth || auth != 'Bearer ' + process.env.CronSecret) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        var cookie = await GetCookie();
        if (!cookie)
            throw new Error('Failed to obtain cookie');

        const resp = await fetch(ChunkUrl, { headers: { 'Cookie': cookie } });
        console.log(`Response from Space-Track, status: ${resp.status} : ${resp.statusText}`);
        const data = await resp.json();
        //TODO FILTER DATA
        const Catalog = data.map(sat => {
            return Object.fromEntries(Object.entries(sat).filter(([key]) => ReqdCols.includes(key)));
        });

        const blob = await put('Catalog.json', JSON.stringify(Catalog), {
            access: 'private',
            contentType: 'application/json',
            addRandomSuffix: false,
            allowOverwrite: true,
        });

        console.log('Catalog uploaded to:', blob.url);
        return new Response(blob.url, { status: 200 });
    }
    catch (error) {
        console.error('Error in DownloadData handler:', error);
        return new Response('Internal Server Error', { status: 500 });
    }
}