import { twoline2satrec, gstime, eciToGeodetic, propagate, geodeticToEcf } from 'satellite.js';

let SatrecMap = new Map();

self.onmessage = function (req) {
    const inp = req.data;

    if (inp.type == 'Compute') {
        const T0 = new Date(inp.T0);
        const T1 = new Date(inp.T1);
        const G0 = gstime(T0);
        const G1 = gstime(T1);
        const buffer = inp.buffer;

        const Positions = new Float64Array(buffer);
        let offset = 0;

        for (const [id, SatRec] of SatrecMap) {
            const PV0 = propagate(SatRec, T0);
            const PV1 = propagate(SatRec, T1);
            if (!PV0 || !PV1 || !PV0.position || !PV1.position) continue;

            const Geo0 = eciToGeodetic(PV0.position, G0);
            const Geo1 = eciToGeodetic(PV1.position, G1);
            const ecef0 = geodeticToEcf(Geo0);
            const ecef1 = geodeticToEcf(Geo1);

            Positions[offset] = id;
            Positions[offset + 1] = ecef0.x * 1000;
            Positions[offset + 2] = ecef0.y * 1000;
            Positions[offset + 3] = ecef0.z * 1000;
            Positions[offset + 4] = ecef1.x * 1000;
            Positions[offset + 5] = ecef1.y * 1000;
            Positions[offset + 6] = ecef1.z * 1000;

            offset += 7;
        }

        self.postMessage({
            type: 'PositionResult',
            buffer: Positions.buffer,
            offset: offset,
            T0: inp.T0,
            T1: inp.T1
        }, [Positions.buffer]);
    }
    else if (inp.type == 'Init') {
        SatrecMap = inp.data;
    }
};