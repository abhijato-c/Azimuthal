import { Viewer, Cartesian3, Color, Ion } from 'cesium';
import * as satellite from 'satellite.js';

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