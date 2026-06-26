import { twoline2satrec, gstime, eciToGeodetic, propagate } from 'satellite.js';

let SatrecMap = new Map();
let ActiveIds = [];
self.onmessage = function (req) {
    const inp = req.data;

    if (inp.type == 'Compute') {
        const CurrTime = new Date(inp.date);
        const gmst = gstime(CurrTime);
        const buffer = inp.buffer;

        const Positions = new Float64Array(buffer);
        let offset = 0;
        for (const id of ActiveIds) {
            const PV = propagate(SatrecMap.get(id), CurrTime);
            if (!PV || !PV.position) continue;
            
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
    else if (inp.type == 'ActiveIds') {
        ActiveIds = inp.data;
    }
    else if (inp.type == 'Init') {
        SatrecMap = inp.data;
    }
};