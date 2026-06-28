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
        const SelId = inp.Selected;

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
    else if (inp.type == 'CalcDetails') {
        const id = inp.id;
        const G0 = gstime(new Date(inp.time));
        const G1 = gstime(new Date(inp.time + 30000));
        const PV0 = propagate(SatrecMap.get(id), new Date(inp.time));
        const PV1 = propagate(SatrecMap.get(id), new Date(inp.time + 30000));
        if (!PV0 || !PV1 || !PV0.position || !PV1.position) return;
        const Geo0 = eciToGeodetic(PV0.position, G0);
        const Geo1 = eciToGeodetic(PV1.position, G1);

        const VelEci = PV0.velocity;
        const speed = Math.sqrt(VelEci.x ** 2 + VelEci.y ** 2 + VelEci.z ** 2) * 3600;

        const lat1 = Geo0.latitude;
        const lon1 = Geo0.longitude;
        const lat2 = Geo1.latitude;
        const lon2 = Geo1.longitude;

        const dLon = lon2 - lon1;

        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

        let bearing = Math.atan2(y, x) * (180 / Math.PI);
        bearing = (bearing + 360) % 360;

        self.postMessage({
            type: 'UpdateStats',
            id: id,
            speed: speed.toFixed(0),
            heading: bearing.toFixed(2),
            latitude: (Geo0.latitude * (180 / Math.PI)).toFixed(2),
            longitude: (Geo0.longitude * (180 / Math.PI)).toFixed(2),
            altitude: Geo0.height.toFixed(3),
        });
    }
    else if (inp.type == 'CalcOrbit') {
        const id = inp.id;
        const time = inp.time;
        const mins = inp.period;
        const samples = inp.samples;

        const step = mins / (samples * 2);
        const Positions = new Float64Array((samples * 2 + 1) * 3);
    
        let ArrOffset = 0;
        for(let i = -samples; i <= samples; ++i) {
            const offset = i * step;
            const Time = new Date(time + (offset * 60 * 1000));
            const PV = propagate(SatrecMap.get(id), Time);
            if (!PV || !PV.position) continue;

            const PosEci = PV.position;
            const gmst = gstime(Time);
            const Geodetic = eciToGeodetic(PosEci, gmst);
            Positions[ArrOffset] = Geodetic.longitude;
            Positions[ArrOffset + 1] = Geodetic.latitude;
            Positions[ArrOffset + 2] = Geodetic.height * 1000
            ArrOffset += 3;
        }

        self.postMessage({
            type: 'OrbitResult',
            buffer: Positions.buffer,
            id: id
        }, [Positions.buffer]);
    }
    else if (inp.type == 'Init') {
        SatrecMap = inp.data;
    }
};