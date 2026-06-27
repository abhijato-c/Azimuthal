# Azimuthal Satellite Tracker

![Banner](https://github.com/abhijato-c/Azimuthal/blob/main/ScreenshotBanner.png)
> A satellite tracking website with details about all active satellites.

---

## Description

Azimuthal is a satelltie tracking website thet displays all satellites currently in orbit as dots around the globe. The satellites move in real time, and you can scrub through the timeline, speed up, slow down and pause the clock to see the satellites moving. You can also filter by name, launch site, operating country, etc. Selecting a satellite will show you its orbital trajectory in red. It also opens up a sidebar where you can see all satellite details, including its identification numbers, launch site, date, country, and orbital details. Rendering is done by CesiumJS.

---

## Technical

1. **CesiumJS:** Main library used for rendering the globe and satellites. All graphics in the center viewport are rendered by CesiumJS, including the globe, orbital lines, satellite dots etc.
2. **Satellite.js:** Used for backend calculations for positions, like parsing TLE's and calculating positions.
3. **Spacetrack:** Website API used to fetch the entire catalog of active satellites with details.
4. **Vercel:** For hosting and CRON jobs to fetch data.
5. **WebWorkers:** Calculates satellite positions and orbital trajectories asynchronously to reduce lag.

---

## AI Usage

AI was used for some design aspects of the frontend, and for research.