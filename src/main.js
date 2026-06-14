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
let Countries = {}
let Sites = {}
let PastUpdate = JulianDate.now();

async function Init(){
	const Request = await fetch('api/FetchCountries');
	const Response = await Request.json();
	Countries = Response.Countries;
	Sites = Response.Sites;

	const SortedCountries = Object.entries(Countries).sort((a, b) => a[0].localeCompare(b[0]));
	Countries = Object.fromEntries(SortedCountries);
	
	const Options = document.getElementById('CountryOptions');
	Object.entries(Countries).forEach(([name, code]) => {
		const label = document.createElement('label');
		label.className = 'MultiselectItem';
		label.innerHTML = `
            <input type="checkbox" value="${code}" checked onchange="UpdateCountrySelection()">
            <span>${name}</span>
        `;
		Options.append(label);
	});
	window.UpdateCountrySelection();

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
	setTimeout(() => document.getElementById('LoadingOverlay').remove(), 300);
}

function TrackingLoop(){
	viewer.scene.preUpdate.addEventListener((scene, time) => {
		if (Math.abs(JulianDate.secondsDifference(time, PastUpdate)) < 0.1) return;

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

window.Search = async function (){
	let Name = document.getElementById("NameSearch").value;
	let FromDate = document.getElementById("LaunchDateFrom").valueAsDate;
	let ToDate = document.getElementById("LaunchDateTo").valueAsDate;
	let ElementCountries = document.querySelectorAll('#CountryOptions input[type="checkbox"]:checked');
	let ElementSites = document.querySelectorAll('#SiteOptions input[type="checkbox"]:checked');
	let SelectedCountries = [];
	let SelectedSites = [];

	if (!FromDate) FromDate = new Date(1900, 0, 0);
	if (!ToDate) ToDate = new Date();
	ElementCountries.forEach((cb) => { SelectedCountries.push(cb.value); });
	ElementSites.forEach((cb) => { SelectedSites.push(cb.value); });

	let filter = {Name: Name, Country: SelectedCountries, Site: SelectedSites, Date: [FromDate, ToDate]};
	const resp = await fetch('/api/FetchCatalog', {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({filters: filter})
	});
	if (!resp.ok) {
		return;
	}

	var IDs = await resp.json();
	IDs = new Set(IDs);
	for (const [id, data] of SatEntries.entries())
		data.Point.show = IDs.has(id);
}

window.ToggleSidebar = function(ID){
	const Sidebar = document.getElementById(ID);
	Sidebar.classList.toggle("open");
	setTimeout(() => viewer.resize(), 400);
}

window.ToggleMultiselect = function(ID){
	document.getElementById(ID).classList.toggle('open');
}

window.UpdateCountrySelection = function(){
	const Selected = document.querySelectorAll('#CountryOptions input[type="checkbox"]:checked');
	let LaunchSites = new Set();
	Selected.forEach((cb) => {
		const CountryName = cb.value;
		Sites[CountryName].forEach(Site => LaunchSites.add(Site));
	});
	
	LaunchSites = Array.from(LaunchSites).sort();
	const SiteOptions = document.getElementById('SiteOptions');
	SiteOptions.innerHTML = '';
	for (const Site of LaunchSites) {
		const label = document.createElement('label');
		label.className = 'MultiselectItem';
		label.innerHTML = `
            <input type="checkbox" value="${Site}" checked>
            <span>${Site}</span>
        `;
		SiteOptions.append(label);
	}
}

document.addEventListener('click', function(e) {
    const Country = document.getElementById('CountrySelectContainer');
	const Site = document.getElementById('SiteSelectContainer');
    if (!Country.contains(e.target))
        document.getElementById('CountryOptions').classList.remove('open');
    if (!Site.contains(e.target))
        document.getElementById('SiteOptions').classList.remove('open');
});

Init();