import { Viewer, Cartesian3, Color, Ion, JulianDate, PointPrimitiveCollection, ScreenSpaceEventHandler, ScreenSpaceEventType, NearFarScalar, CallbackProperty, BoundingSphere, Polyline, PolylineCollection, Material, UrlTemplateImageryProvider, ImageryLayer, Check } from 'cesium';
import { twoline2satrec, gstime, eciToGeodetic, propagate } from 'satellite.js';
import SatWorker from '/helpers/SatWorker.js?worker';

Ion.defaultAccessToken = import.meta.env.VITE_token;
const viewer = new Viewer('cesiumContainer', {
	baseLayer: new ImageryLayer(new UrlTemplateImageryProvider({
		url: `https://api.maptiler.com/maps/hybrid-v4/{z}/{x}/{y}.jpg?key=${import.meta.env.VITE_MAPTILER_KEY}`
	})),
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
	requestRenderMode: false,
	skyAtmosphere: false,
	scene3DOnly: true,
});
viewer.resolutionScale = window.devicePixelRatio;
viewer.scene.screenSpaceCameraController.maximumZoomDistance = 5e8;
viewer.scene.globe.showGroundAtmosphere = false;
viewer.scene.globe.enableLighting = false;
viewer.scene.atmosphere.show = false;
viewer.scene.fog.enabled = false;

const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
const Points = viewer.scene.primitives.add(new PointPrimitiveCollection());
const Orbits = viewer.scene.primitives.add(new PolylineCollection());
const SatEntries = new Map();
const Worker = new SatWorker();
let WorkerBusy = false;
let PositionsBuffer = null;
let ImageNames = [];
let Countries = {}
let Sites = {}
let PageIndex = 0;
let PageLength = 50;
let ActiveIds = null;
let OrbitLine = null;
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


async function Init() {
	const ImageReq = await fetch('/Satellites/ImageNames.json');
	ImageNames = await ImageReq.json();

	const CountryReq = await fetch('/api/FetchCountries');
	const CountryRes = await CountryReq.json();
	Countries = CountryRes.Countries;
	Sites = CountryRes.Sites;

	const SortedCountries = Object.entries(Countries).sort((a, b) => a[0].localeCompare(b[0]));
	Countries = Object.fromEntries(SortedCountries);
	
	const Options = document.getElementById('CountryOptions');

	const SelectAll = document.createElement('label');
	SelectAll.className = 'MultiselectItem';
	SelectAll.innerHTML = `
		<input type="checkbox" value="All" id="CountrySelectAll" checked onchange="CountrySelectAll()">
		<span>Select All</span>
	`;
	Options.append(SelectAll);

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
	const CatalogReq = await fetch('/api/FetchInitial');
	const CatalogRes = await CatalogReq.json();

	console.log('Initializing satellites');
	const SatrecMap = new Map();
	CatalogRes.forEach(sat => {
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
		SatrecMap.set(sat.norad_id, SatRec);
	});
	Worker.postMessage({
		type: "Init",
		data: SatrecMap
	});
	PositionsBuffer = new ArrayBuffer(SatEntries.size * 4 * 8);

	await window.Search();

	viewer.scene.preUpdate.addEventListener((scene, time) => {
		if (!viewer.clockViewModel.shouldAnimate || WorkerBusy) return;
		WorkerBusy = true;
		const DateStr = JulianDate.toDate(time).toISOString();
		Worker.postMessage({
			type: 'Compute',
			date: DateStr,
			ids: ActiveIds,
			buffer: PositionsBuffer
		}, [PositionsBuffer]);
	});

	document.getElementById('LoadingOverlay').remove();
}

function RenderPage(){
	var SatList = document.getElementById("SearchScroll");
	SatList.innerHTML = "";

	for (let i = PageIndex * PageLength; i < ActiveIds.length && i < (PageIndex + 1) * PageLength; ++i){
		const sat = SatEntries.get(ActiveIds[i])

		const tab = document.createElement('div');
		tab.className = "SatCard";
		tab.innerHTML = `
			<img src="${GetSatImage(sat.Details.name)}" alt="Satellite">
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

function GetSatImage(Name) {
	Name = Name.toUpperCase();
	const match = ImageNames.find(exp => Name.includes(exp));
	return match ? `/Satellites/${match}.png` : '/Satellites/GENERIC.png';
}

Worker.onmessage = function(res) {
	const inp = res.data;
	if (inp.type == 'PositionResult') {
		PositionsBuffer = inp.buffer;
		const data = new Float64Array(PositionsBuffer);

		for (let i = 0; i < inp.offset; i += 4) {
			const id = data[i];
			const sat = SatEntries.get(id);
			if (!sat || sat == null || !sat.Point) continue;
			sat.Point.position = Cartesian3.fromRadians(data[i+1], data[i+2], data[i+3]);
		}
	}
	WorkerBusy = false;
}

window.Search = async function (){
	let Name = document.getElementById("NameSearch").value;
	let FromDate = document.getElementById("LaunchDateFrom").valueAsDate;
	let ToDate = document.getElementById("LaunchDateTo").valueAsDate;
	let ElementCountries = document.querySelectorAll('#CountryOptions input[type="checkbox"]:checked');
	let ElementSites = document.querySelectorAll('#SiteOptions input[type="checkbox"]:checked');
	let SelectedCountries = ['bugfix'];
	let SelectedSites = ['bugfix'];

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

	var IDs = await resp.json();
	IDs = new Set(IDs);
	for (const [id, sat] of SatEntries.entries()) {
		sat.Point.show = IDs.has(id);
	}
	ActiveIds = Array.from(IDs);
	ActiveIds.sort((A, B) => {
		const NameA = SatEntries.get(A).Details.name;
		const NameB = SatEntries.get(B).Details.name;
		return NameA.localeCompare(NameB);
	});


	PageIndex = 0;
	RenderPage();

	if (!WorkerBusy) {
		WorkerBusy = true;
		const DateStr = JulianDate.toDate(viewer.clock.currentTime).toISOString();
		Worker.postMessage({
			type: 'Compute',
			date: DateStr,
			ids: ActiveIds,
			buffer: PositionsBuffer
		}, [PositionsBuffer]);
	}
}

window.SatClicked = async function (SatId) {
	window.ResetTrack();
	document.getElementById("SatName").textContent = "Loading...";

	const resp = await fetch('/api/FetchDetails', {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({id: SatId})
	});
	var details = await resp.json();
	
	const Sidebar = document.getElementById('RightSidebar');
	Sidebar.classList.add("open");
	setTimeout(() => viewer.resize(), 400);
	
	document.getElementById("SatImg").src = GetSatImage(details.name);
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
	
	const sat = SatEntries.get(SatId);
	TrackingId = SatId;
	viewer.trackedEntity = TrackingEntity;
	viewer.camera.flyToBoundingSphere(
		new BoundingSphere(sat.Point.position, 500000),
		{ duration: 1 }
	);

	const positions = [];
	const mins = details.period;
	const samples = 50 * 2;
	const step = mins / samples / 2;
	const satrec = sat.satrec;

	for(let i = -samples; i <= samples; ++i) {
		const offset = i * step;
		const Time = new Date(JulianDate.toDate(viewer.clock.currentTime).getTime() + (offset * 60 * 1000));

		const PV = propagate(sat.SatRec, Time);
		if (!PV || !PV.position) continue;
		const PosEci = PV.position;
		if (PosEci){
			const gmst = gstime(Time);
			const Geodetic = eciToGeodetic(PosEci, gmst);
			const cart = Cartesian3.fromRadians(
				Geodetic.longitude,
				Geodetic.latitude, 
				Geodetic.height * 1000
			);
			positions.push(cart);
		}
	}
	OrbitLine = Orbits.add({
		positions: positions,
		width: 3,
		material: Material.fromType("Color", { color: Color.RED })
	});
}

window.ResetTrack = function() {
	const Sidebar = document.getElementById('RightSidebar');
	Sidebar.classList.remove("open");
	setTimeout(() => viewer.resize(), 400);

	document.getElementById("SatImg").src = GetSatImage('Minceraft');
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
	
	if (OrbitLine != null) {
		Orbits.remove(OrbitLine);
		OrbitLine = null;
	}
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
	if (Next && PageIndex < Math.trunc(ActiveIds.length / PageLength))
		PageIndex += 1;
	else if (!Next && PageIndex > 0)
		PageIndex -=1;
	RenderPage();
}

window.UpdateCountrySelection = function(){
	const Selected = document.querySelectorAll('#CountryOptions input[type="checkbox"]:checked');
	
	let count = Selected.length;
	if (document.getElementById('CountrySelectAll').checked) count -= 1;
	document.getElementById("CountryMultiselectLabel").textContent = count + ' selected';
	
	let LaunchSites = new Set();
	Selected.forEach((cb) => {
		if (cb.value == 'All') return;
		Sites[cb.value].forEach(Site => LaunchSites.add(Site));
	});
	
	LaunchSites = Array.from(LaunchSites).sort();
	const SiteOptions = document.getElementById('SiteOptions');
	SiteOptions.innerHTML = '';
	
	const SelectAll = document.createElement('label');
	SelectAll.className = 'MultiselectItem';
	SelectAll.innerHTML = `
	<input type="checkbox" value="All" id="SiteSelectAll" checked onchange="SiteSelectAll()">
	<span>Select All</span>
	`;
	SiteOptions.append(SelectAll);
	
	for (const Site of LaunchSites) {
		const label = document.createElement('label');
		label.className = 'MultiselectItem';
		label.innerHTML = `
            <input type="checkbox" value="${Site}" checked onchange="UpdateSiteSelection()">
            <span>${Site}</span>
			`;
		SiteOptions.append(label);
	}
	UpdateSiteSelection();
}

window.UpdateSiteSelection = function(){
	const Selected = document.querySelectorAll('#SiteOptions input[type="checkbox"]:checked');
	let count = Selected.length;
	if (document.getElementById('SiteSelectAll').checked) count -= 1;
	document.getElementById("SiteMultiselectLabel").textContent = count + ' selected';
}

window.CountrySelectAll = function(){
	const CountryOptions = document.getElementById('CountryOptions');
	const Checkboxes = CountryOptions.querySelectorAll('input[type="checkbox"]');
	const ToCheck = document.getElementById('CountrySelectAll').checked;
	Checkboxes.forEach(cb => {
		cb.checked = ToCheck;
	});
	UpdateCountrySelection();
}

window.SiteSelectAll = function(){
	const SiteOptions = document.getElementById('SiteOptions');
	const Checkboxes = SiteOptions.querySelectorAll('input[type="checkbox"]');
	const ToCheck = document.getElementById('SiteSelectAll').checked;
	Checkboxes.forEach(cb => {
		cb.checked = ToCheck;
	});
	UpdateSiteSelection();
}

document.addEventListener('click', function(e) {
	const Country = document.getElementById('CountrySelectContainer');
	const Site = document.getElementById('SiteSelectContainer');
    if (!Country.contains(e.target))
        document.getElementById('CountryOptions').classList.remove('open');
    if (!Site.contains(e.target))
        document.getElementById('SiteOptions').classList.remove('open');
});

handler.setInputAction(function (event) {
	const obj = viewer.scene.pick(event.position);
	if (obj && obj.primitive && obj.primitive.id) {
		SatClicked(obj.primitive.id);
	}
	else {
		ResetTrack();
	}
}, ScreenSpaceEventType.LEFT_CLICK);

Init();