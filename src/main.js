import { Viewer, Cartesian3, Color, Ion, JulianDate, PointPrimitiveCollection } from 'cesium';
import * as satellite from 'satellite.js';

Ion.defaultAccessToken = import.meta.env.VITE_token;
const viewer = new Viewer('cesiumContainer', {
	baseLayerPicker: false,
	fullScreenButton: false,
	vrButton: false,
	infoBox: false,
	homeButton: false,
	navigationHelpButton: false,
	geocoder: false,
	fullscreenButton: false,
	shouldAnimate: true,
	projectionPicker: false,
	sceneModePicker: false,
	scene3DOnly: true,
})

const SatEntries = new Map();
const Points = viewer.scene.primitives.add(new PointPrimitiveCollection());
let PastUpdate = JulianDate.now();

async function Init(){
	console.log('Fetching initial data');
	const req = await fetch('/api/FetchInitial');
	const results = await req.json();

	console.log('Initializing satellites');
	results.forEach(sat => {
		const SatRec = satellite.twoline2satrec(sat.tle_line1, sat.tle_line2);
		const Point = Points.add({
			position: Cartesian3.ZERO,
			color: Color.BLUE,
			pixelSize: 4,
			id: sat.norad_id
		});
		SatEntries.set(sat.norad_id, {Point, SatRec});
	});

	console.log('Tracking');
	TrackingLoop();

	// Dismiss loading screen
	const Loader = document.getElementById('LoadingOverlay');
	Loader.style.opacity = '0';
	Loader.style.visibility = 'hidden';
	setTimeout(() => Loader.remove(), 300);
}

function TrackingLoop(){
	viewer.scene.preUpdate.addEventListener((scene, time) => {
		if (JulianDate.secondsDifference(time, PastUpdate) < 0.1) return;

		PastUpdate = time;
		const Date = JulianDate.toDate(time);
		const gmst = satellite.gstime(Date);

		for (const sat of SatEntries.values()){
			if (!sat.Point.show) continue;

			const PV = satellite.propagate(sat.SatRec, Date);
			if (!PV || !PV.position) continue;
			const PosEci = PV.position;
			if (PosEci){
				const Geodetic = satellite.eciToGeodetic(PosEci, gmst);
				sat.Point.position = Cartesian3.fromRadians(
					Geodetic.longitude,
					Geodetic.latitude, 
					Geodetic.height * 1000
				);
			}
		}
	});
}

window.ToggleSidebar = function(ID){
	console.log('clicked');
	const Sidebar = document.getElementById(ID);
	Sidebar.classList.toggle("open");
	setTimeout(() => viewer.resize(), 400);
}

//document.getElementById('LoadingOverlay').remove()
Init();