import { Viewer, Cartesian3, Color, Ion, JulianDate, PointPrimitiveCollection, ScreenSpaceEventHandler, ScreenSpaceEventType, NearFarScalar, CallbackProperty, BoundingSphere } from 'cesium';
import { twoline2satrec, gstime, eciToGeodetic, propagate } from 'satellite.js';

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
	shouldAnimate: false,
	projectionPicker: false,
	sceneModePicker: false,
	scene3DOnly: true,
	requestRenderMode: false,
});
viewer.resolutionScale = window.devicePixelRatio;
viewer.scene.screenSpaceCameraController.maximumZoomDistance = 5e8;

const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
const SatEntries = new Map();
const Points = viewer.scene.primitives.add(new PointPrimitiveCollection());
let Countries = {}
let Sites = {}
let PastUpdate = JulianDate.now();
let PageIndex = 0;
let PageLength = 50;
let ActiveIds = null;
let TrackingId = null;
let TrackingEntity = viewer.entities.add({
	id: "Tracker",
	position: new CallbackProperty((time, res) => {
		if (TrackingId) return SatEntries.get(TrackingId).Point.position;
		return undefined;
	}, false),
	viewFrom: new Cartesian3(0, -500000, 500000),
	point: { pixelSize: 0 }
});

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
		const SatRec = twoline2satrec(sat.tle_line1, sat.tle_line2);
		const Point = Points.add({
			position: Cartesian3.ZERO,
			color: Color.fromCssColorString('#00a8ff').withAlpha(0.8),
			pixelSize: 12,
			scaleByDistance: new NearFarScalar(1.0e5, 1.0, 2.0e7, 0.2),
			id: sat.norad_id
		});
		const Details = sat;
		SatEntries.set(sat.norad_id, {Point, SatRec, Details});
	});

	window.Search();

	console.log('Tracking');
	TrackingLoop();

	document.getElementById('LoadingOverlay').remove();
}

function TrackingLoop(){
	viewer.scene.preUpdate.addEventListener((scene, time) => {
		if (!viewer.clockViewModel.shouldAnimate) return;
		const Julian = JulianDate.toDate(time);
		const gmst = gstime(Julian);

		for (const sat of SatEntries.values()){
			if (!sat.Point.show) continue;

			const PV = propagate(sat.SatRec, Julian);
			if (!PV || !PV.position) continue;
			const PosEci = PV.position;
			if (PosEci){
				const Geodetic = eciToGeodetic(PosEci, gmst);
				sat.Point.position = Cartesian3.fromRadians(
					Geodetic.longitude,
					Geodetic.latitude, 
					Geodetic.height * 1000
				);
			}
		}
	});
}

handler.setInputAction(function (event) {
	const obj = viewer.scene.pick(event.position);
	if (obj && obj.primitive && obj.primitive.id) {
		SatClicked(obj.primitive.id);
	}
	else {
		ResetTrack();
	}
}, ScreenSpaceEventType.LEFT_CLICK);

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

	const first = String(PageIndex * PageLength + 1);
	const last = String(Math.min(ActiveIds.length, (PageIndex + 1) * PageLength));
	const max = String(ActiveIds.length);
	document.getElementById("PageNo").innerText = first + '-' + last + ' / ' + max;
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
	const gmst = gstime(Julian);
	
	for (const [id, sat] of SatEntries.entries()) {
		sat.Point.show = IDs.has(id);
		if (!sat.Point.show) continue;

		const PV = propagate(sat.SatRec, Julian);
		if (!PV || !PV.position) continue;
		const PosEci = PV.position;
		if (PosEci){
			const Geodetic = eciToGeodetic(PosEci, gmst);
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
	window.ResetTrack();
	document.getElementById("SatName").textContent = "Loading...";

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

	TrackingId = SatId;
	viewer.trackedEntity = TrackingEntity;
	viewer.camera.flyToBoundingSphere(
		new BoundingSphere(SatEntries.get(SatId).Point.position, 500000),
		{ duration: 1 }
	);
}

window.ResetTrack = function() {
	const Sidebar = document.getElementById('RightSidebar');
	Sidebar.classList.remove("open");
	setTimeout(() => viewer.resize(), 400);

	document.getElementById("SatName").textContent = "No Satellite Selected";
	document.getElementById("DetailNorad").textContent = "";
	document.getElementById("DetailIntl").textContent = "";
	document.getElementById("DetailDate").textContent = "";
	document.getElementById("DetailCountry").textContent = "";
	document.getElementById("DetailSite").textContent = "";
	document.getElementById("DetailApoapsis").textContent = "";
	document.getElementById("DetailPeriapsis").textContent = "";
	document.getElementById("DetailInclination").textContent = "";
	document.getElementById("DetailEccentricity").textContent = "";
	document.getElementById("DetailPeriod").textContent = "";

	TrackingId = null;
	viewer.trackedEntity = undefined;
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