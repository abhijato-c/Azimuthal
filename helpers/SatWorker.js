import { twoline2satrec, gstime, eciToGeodetic, propagate } from 'satellite.js';

let SatrecMap = new Map();
self.onmessage = function (req) {
    const inp = req.data;

    if (inp.type == 'Compute') {
        const CurrTime = new Date(inp.date);
        const gmst = gstime(CurrTime);
        const Ids = inp.ids;
        const buffer = inp.buffer;

        const Positions = new Float64Array(buffer);
        let offset = 0;
        for (const id of Ids) {
            const PV = propagate(SatrecMap.get(id), CurrTime);
            if (!PV) continue;
            
            const Geodetic = eciToGeodetic(PV.position, gmst);
            Positions[offset] = id;
            Positions[offset + 1] = Geodetic.longitude;
            Positions[offset + 2] = Geodetic.latitude;
            Positions[offset + 3] = Geodetic.height * 1000;
            offset += 4;
        }

        self.postMessage({
            type: 'PositionResult',
            buffer: Positions.buffer,
            offset: offset
        }, [Positions.buffer]);
    }
    else if (inp.type == 'Init') {
        SatrecMap = inp.data;
    }
};