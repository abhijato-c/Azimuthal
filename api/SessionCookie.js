import { put, get } from '@vercel/blob';

let BLOB_URL = "https://oak9imuykyhibxko.private.blob.vercel-storage.com/session/SpacetrackCookie.json";
const TestUrl = "https://www.space-track.org/basicspacedata/query/class/gp/NORAD_CAT_ID/25544/limit/1/format/json";
const LoginUrl = "https://www.space-track.org/ajaxauth/login";

export async function GetCookie(){
    let CachedCookie = null;

    // Try to fetch stored cookie
    if (BLOB_URL) {
        try {
            const response = await fetch(BLOB_URL, {
                headers: {'Authorization': `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`}
            });
            if (response.ok)
                CachedCookie = await response.json();
            else
                throw new Error('Failed to fetch cookie:' + response.statusText);
        }
        catch (error) {
            console.error('Error fetching cookie:', error);
            CachedCookie = null;
        }
    }

    if (CachedCookie && CachedCookie.Cookie && CachedCookie.Expiry && CachedCookie.Expiry > Date.now()) {
        // Test Cookie
        const Cookie = CachedCookie.Cookie;

        try {
            const resp = await fetch(TestUrl, {headers: { 'cookie': Cookie }});
            if (resp.ok) {
                console.log('Cookie retrieved from blob is valid');
                return Cookie;
            }
            else {
                console.error('Cookie test not 200:', resp.statusText);
                CachedCookie = null;
            }
        }
        catch (error) {
            console.error('Error testing cookie:', error);
            CachedCookie = null;
        }
    }

    // Do login
    console.log('Logging in to Space-Track');
    const resp = await fetch(LoginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `identity=${encodeURIComponent(process.env.SPACETRACK_EMAIL)}&password=${encodeURIComponent(process.env.SPACETRACK_PASSWORD)}`
    });
    if (!resp.ok)
        throw new Error('Login failed:' + resp.statusText);

    const RawCookie = resp.headers.get('set-cookie');
    console.log('Received cookie:', RawCookie);

    const CleanCookie = RawCookie.split(';')[0];

    const ExpiryMatch = RawCookie.match(/expires=([^;]+)/);
    const ExpiryDate = new Date(ExpiryMatch[1]).getTime();

    const JsonVal = { Cookie: CleanCookie, Expiry: ExpiryDate };

    // Store cookie
    const blob = await put('session/SpacetrackCookie.json', JSON.stringify(JsonVal), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
    });

    BLOB_URL = blob.url;
    console.log(`Cookie stored successfully at ${BLOB_URL}`);

    return CleanCookie;
}