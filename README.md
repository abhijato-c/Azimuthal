# Azimuthal Satellite Tracker

![Banner](https://github.com/abhijato-c/Azimuthal/blob/main/ScreenshotBanner.png)
> A satellite tracking website with details about all active satellites.

---

## Description

Azimuthal is a satelltie tracking website thet displays all satellites currently in orbit as dots around the globe. The satellites move in real time, and you can scrub through the timeline, speed up, slow down and pause the clock to see the satellites moving. You can also filter by name, launch site, operating country, etc. Selecting a satellite will show you its orbital trajectory in red. It also opens up a sidebar where you can see all satellite details, including its identification numbers, launch site, date, country, and orbital details. Rendering is done by CesiumJS.

---

## Features

1. **Displays satellites:** Shows all currently active satellites as a blue dot above the earth.
2. **Real-time tracking:** If the CesiumJS timeline is on, all satellites move in real time, reflecting their position.
3. **Orbital trajectories:** Selecting a satellite will display its orbital trajectory as a red line.
4. **Filtering:** Satellites shown can be filtered in the left sidebar by name, launch date, launch country/organization and site.
5. **Sidebar listing:** All shown satellites are listed in the left sidebar, with an image, name and details.
6. **Satellite details:** The right sidebar shows all satellite details, including position, altitude and speed.

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