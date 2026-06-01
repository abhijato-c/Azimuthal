import { Viewer, Cartesian3, Color, Ion } from 'cesium';
import * as satellite from 'satellite.js/dist/satellite.min.js';

console.log(import.meta.env.VITE_token);
Ion.defaultAccessToken = import.meta.env.VITE_token;
const viewer = new Viewer('cesiumContainer', {
	baseLayerPicker: false,
	fullScreenButton: false,
	vrButton: false,
	infoBox: false,
	shouldAnimate: true,
	projectionPicker: false,
	sceneModePicker: false,
	scene3DOnly: true
})
