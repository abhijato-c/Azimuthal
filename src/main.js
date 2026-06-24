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
let PageIndex = 0;
let PageLength = 50;
let ActiveIds = null;

async function Init(){
	const Request = await fetch('/api/FetchCountries');
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
		const Details = sat;
		SatEntries.set(sat.norad_id, {Point, SatRec, Details});
	});

	window.Search();

	console.log('Tracking');
	TrackingLoop();

	setTimeout(() => document.getElementById('LoadingOverlay').remove(), 300);
}

function TrackingLoop(){
	viewer.scene.preUpdate.addEventListener((scene, time) => {
		if (Math.abs(JulianDate.secondsDifference(time, PastUpdate)) < 0.1) return;

		PastUpdate = time;
		const Julian = JulianDate.toDate(time);
		const gmst = satellite.gstime(Julian);

		for (const sat of SatEntries.values()){
			if (!sat.Point.show) continue;

			const PV = satellite.propagate(sat.SatRec, Julian);
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

function RenderPage(){
	var SatList = document.getElementById("SearchScroll");
	SatList.innerHTML = "";

	for (let i = PageIndex * PageLength; i < ActiveIds.length && i < (PageIndex + 1) * PageLength; ++i){
		const sat = SatEntries.get(ActiveIds[i])

		const tab = document.createElement('div');
		tab.className = "SatCard";
		tab.innerHTML = `
			<img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQSSXsRTl4fxB9zeceEeEcRLo2yxlLJMSeqww&s" alt="Satellite">
			<div class="SatCardDetails">
				<span class="SatName">${sat.Details.name}</span>
				<div class="DetailsLine">
					<span class="Country">Country: ${sat.Details.country}</span>
					<span class="Site">Site: ${sat.Details.launch_site}</span>
				</div>
				<div class="DetailsLine">
					<span class="Norad">NORAD: ${sat.Details.norad_id}</span>
					<span class="Site">INTL: ${sat.Details.intl_designator}</span>
				</div>
			</div>
		`;
		tab.onclick = () => SatClicked(ActiveIds[i]);
		SatList.append(tab);
	}

	document.getElementById("PageNo").innerText = String(PageIndex * PageLength + 1) + '-' + String(Math.min(ActiveIds.length, (PageIndex + 1) * PageLength)) + ' / ' + String(ActiveIds.length);
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
	ActiveIds = Array.from(IDs);
	ActiveIds.sort((A, B) => {
		const NameA = SatEntries.get(A).Details.name;
		const NameB = SatEntries.get(B).Details.name;
		return NameA.localeCompare(NameB);
	});

	const Julian = JulianDate.toDate(viewer.clock.currentTime);
	const gmst = satellite.gstime(Julian);
	
	for (const [id, sat] of SatEntries.entries()) {
		sat.Point.show = IDs.has(id);
		if (!sat.Point.show) continue;

		const PV = satellite.propagate(sat.SatRec, Julian);
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

	PageIndex = 0;
	RenderPage();
}

window.SatClicked = async function (SatId) {
	const resp = await fetch('/api/FetchDetails', {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({id: SatId})
	});
	if (!resp.ok) {
		return;
	}
	var details = await resp.json();

	const Sidebar = document.getElementById('RightSidebar');
	Sidebar.classList.add("open");
	setTimeout(() => viewer.resize(), 400);

	document.getElementById("SatName").textContent = details.name;
	document.getElementById("DetailNorad").textContent = details.norad_id;
	document.getElementById("DetailIntl").textContent = details.intl_designator;
	document.getElementById("DetailDate").textContent = details.launch_date.split('T')[0];
	document.getElementById("DetailCountry").textContent = details.country;
	document.getElementById("DetailSite").textContent = details.launch_site;
	document.getElementById("DetailApoapsis").textContent = details.apoapsis;
	document.getElementById("DetailPeriapsis").textContent = details.periapsis;
	document.getElementById("DetailInclination").textContent = details.inclination;
	document.getElementById("DetailEccentricity").textContent = details.eccentricity;
	document.getElementById("DetailPeriod").textContent = details.period;
}

window.ToggleSidebar = function(ID){
	const Sidebar = document.getElementById(ID);
	Sidebar.classList.toggle("open");
	setTimeout(() => viewer.resize(), 400);
}

window.ToggleMultiselect = function(ID){
	document.getElementById(ID).classList.toggle('open');
}

window.PageTurn = function(Next) {
	if (Next)
		PageIndex += 1;
	else
		PageIndex -=1;
	RenderPage();
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