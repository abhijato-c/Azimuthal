const COUNTRY_URL = "https://oak9imuykyhibxko.private.blob.vercel-storage.com/Countries.json";
const SITE_URL = "https://oak9imuykyhibxko.private.blob.vercel-storage.com/Sites.json"

export default async function handler(req, res) {
    try {
        let JCountries = {};
        let JSites = {};

        const CountryResponse = await fetch(COUNTRY_URL, {
            headers: {'Authorization': `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`}
        });
        if (CountryResponse.ok)
            JCountries = await CountryResponse.json();
        else
            throw new Error('Failed to fetch countries:' + CountryResponse.statusText);

        const SiteResponse = await fetch(SITE_URL, {
            headers: {'Authorization': `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`}
        });
        if (SiteResponse.ok)
            JSites = await SiteResponse.json();
        else
            throw new Error('Failed to fetch Sites:' + SiteResponse.statusText);

        return res.status(200).json({Countries: JCountries, Sites: JSites});
    }
    catch (error) {
        console.error('Error fetching countries:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}