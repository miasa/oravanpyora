//Settings
const HSL_GRAPHQL_URL = 'https://api.digitransit.fi/routing/v1/routers/hsl/index/graphql';
const HSL_MQTT_URL = 'mqtts://mqtt.hsl.fi:443/';
const HSL_MQTT_TRAM_URL = '/hfp/v2/journey/ongoing/vp/tram/#';
const HSL_TRAINS_URL = 'https://rata.digitraffic.fi/api/v1/live-trains';
const MAPBOX_TOKEN = 'pk.eyJ1IjoibWlhc2EiLCJhIjoiY2p1dTQyczF6MDcyeTN5bm8xbWFoazBkdiJ9.BI5xVCsJISLyzFAG3W2V-A';
const MAPBOX_STYLE = 'mapbox://styles/miasa/cjvb962rs12y61fkxql06jhj2';
const MAPBOX_DEFAULT_ZOOM = 13.5;
const TRAIN_REFRESH_INTERVAL_MS = 30000; //30 seconds in ms
const TRAM_REFRESH_INTERVAL_MS = 30000;
const BIKESTATION_REFRESH_INTERVAL_MS = 30000;

//Filters
const wantedTramLines = ['1', '1H', '3','6'];
const wantedTrainLines = ['A', 'E', 'U', 'Y', 'L'];
const wantedBikeStations = [
  '021', //Töölönlahdenkatu
  '022', //Rautatientori, länsi
  '023', //Kiasma
  '006', //Hietalahdentori
  '067', //Perämiehenkatu
  '005'  //Sepänkatu
];
const stopAtWork = 'HSL:1050417';
const trainStation = 'HKI';


//----------------------------

const markers = [];
let client;
let t;

//Map

function initMap() {
  mapboxgl.accessToken = MAPBOX_TOKEN;

  map = new mapboxgl.Map({
    container : 'map-canvas',
    style     : MAPBOX_STYLE,
    zoom      : MAPBOX_DEFAULT_ZOOM,
    center    : [24.9399946, 60.1729721]
  });

  moveToUserLocation();
}

function moveToUserLocation() {
  const geoTracker = new mapboxgl.GeolocateControl({
    fitBoundsOptions: {
      maxZoom: MAPBOX_DEFAULT_ZOOM
    },
    trackUserLocation: true,
    trigger: true
  });

  map.addControl(geoTracker);

  setTimeout(function() {
    geoTracker.trigger();
  }, 800);
}

function markerExists(id) {
  return markers.some(marker => marker.id === id);
}

function getMarker(id) {
  const index = markers.findIndex(marker => marker.id === id);
  return markers[index];
}

//Bike stations

function getStationStatus(bikesAvailable) {
  return bikesAvailable >= 3 ? 'plenty' : 'few';
}

function createStation(stationObject) {
  const bikesAvailable = parseInt(stationObject.bikesAvailable);
  const labelContent = '<div class="count">' + bikesAvailable + '</div>';
  const stationStatus = getStationStatus(bikesAvailable);

  const el = document.createElement('div');
  el.className = `marker marker-bikestation bikestation-${stationObject.stationId} status-${stationStatus}`;
  el.innerHTML = labelContent;

  const markerObject = new mapboxgl.Marker({
    element : el,
    anchor  : 'center'
  }).setLngLat([stationObject.lon, stationObject.lat]);

  const stationMarker = {
    markerObject : markerObject,
    id           : stationObject.stationId,
    type         : 'station'
  };

  markers.push(stationMarker);
  stationMarker.markerObject.addTo(map);
}

function updateBikeStation(stationObject) {
  const element = document.querySelector('.bikestation-' + stationObject.stationId);
  if(element) {
    const bikesAvailable = parseInt(stationObject.bikesAvailable);
    const stationStatus = getStationStatus(bikesAvailable)
    element.querySelector('.count').innerHTML = bikesAvailable;
    element.classList.forEach(className => {
      if(className.startsWith('status-')) {
        element.classList.remove(className);
      }
    });
    element.classList.add(`status-${stationStatus}`);
  }
}

function createOrUpdateBikeStations(stationObjects) {
  stationObjects.forEach(stationObject => {
    if(markerExists(stationObject.stationId)) {
      updateBikeStation(stationObject);
    } else {
      createStation(stationObject);
    }
  });
}

function fetchBikeStations() {
  const query = `
    {
      bikeRentalStations {
        stationId
        lat
        lon
        name
        bikesAvailable
        spacesAvailable
        state
      }
    }
  `;

  return fetch(HSL_GRAPHQL_URL, {
    method  : 'post',
    body    : JSON.stringify({query: query}),
    headers : {'Content-Type': 'application/json'},
  })
    .then(res => res.json())
    .then(res => {
      return res.data.bikeRentalStations
        .map(station => {
          if(station.state === 'Station off') {
            station.active = false;
          } else {
            station.active = true;
          }
          delete station.state;
          return station;
        })
        .filter(station => station.active)
        .filter(station => wantedBikeStations.includes(station.stationId));
    });
}

function initBikeStations() {
  fetchBikeStations().then(data => createOrUpdateBikeStations(data));
  window.setInterval(() => {
    fetchBikeStations().then(data => createOrUpdateBikeStations(data));
  }, BIKESTATION_REFRESH_INTERVAL_MS);
}

//Trams

function createTram(tramObject) {
  const el = document.createElement('div');
  el.className = `marker marker-tram tram-` + tramObject.id;
  el.innerHTML = '<div class="line">' + tramObject.line + '</div><div class="direction"></div>';

  const markerObject = new mapboxgl.Marker({
    element : el,
    anchor  : 'center'
  }).setLngLat([tramObject.lon, tramObject.lat]);

  const tramnMarker = {
    markerObject : markerObject,
    id           : tramObject.id,
    type         : 'tram'
  };

  markers.push(tramnMarker);
  tramnMarker.markerObject.addTo(map);
}

function updateTram(tramObject) {
  const element = document.querySelector('.tram-' + tramObject.id);
  if(element) {
    const markerObject = getMarker(tramObject.id).markerObject;
      markerObject.setLngLat([tramObject.lon, tramObject.lat]);
      updateTramDirection(element, tramObject.hdg);
  }
}

function updateTramDirection(element, direction) {
  const directionElement = element.querySelector('.direction');
  if(typeof direction === 'number') {
    directionElement.style.transform = 'rotate(' + direction + 'deg)';
    directionElement.classList.remove('hidden');
  } else {
    directionElement.classList.add('hidden');
  }
}

function createOrUpdateTram(tramObject) {
  if(markerExists(tramObject.id)) {
    updateTram(tramObject);
  } else {
    createTram(tramObject);
  }
}

function initTrams() {
  if(client) {
    client.end(true);
  }

  client = mqtt.connect(HSL_MQTT_URL);

  client.on("connect", function() {
    client.subscribe(HSL_MQTT_TRAM_URL);
  });

  client.on("message", function(topic, payload, packet) {
    var VP = JSON.parse(payload.toString()).VP;

    if(!VP.lat || !VP.long) {
      return;
    }

    if(wantedTramLines.includes(VP.desi)) {
      createOrUpdateTram({
        id   : VP.oper + '-' + VP.veh,
        line : VP.desi,
        lon  : VP.long,
        lat  : VP.lat,
        hdg  : VP.hdg
      });
    }
  });
}

//Work departures

function fetchWorkDepartures() {
  const query = `
    {
      stop(id: "${stopAtWork}") {
        name
        stoptimesWithoutPatterns(numberOfDepartures: 2, omitNonPickups: true) {
          scheduledArrival
          realtimeArrival
          arrivalDelay
          scheduledDeparture
          realtimeDeparture
          departureDelay
          realtime
          realtimeState
          serviceDay
          headsign
          trip {
            directionId
            routeShortName
          }
        }
      }  
    }
  `;

  return fetch(HSL_GRAPHQL_URL, {
    method  : 'post',
    body    : JSON.stringify({query: query}),
    headers : {'Content-Type': 'application/json'},
  })
    .then(res => res.json())
    .then(res => {
      const departures = [...res.data.stop.stoptimesWithoutPatterns];

      departures.forEach(dep => {
        dep.timestamp = dep.serviceDay + dep.scheduledDeparture;
      });

      return {
        name       : res.data.stop.name,
        departures : departures
      };
    });
}

function renderWorkDepartures(stop) {
  const markup = `
    <h6 class="departure-title">${stop.name}</h6>
    <ul class="departure-list">
    ${stop.departures.map(departure => {
      return `
        <li><strong class="cell">${departure.trip.routeShortName}</strong> <span class="cell">${timeStampToTime(departure.timestamp)}</span></li>
      `;
    }).join('')}
    </ul>
  `;
  document.getElementById('departures-tram').innerHTML = markup;
}

function timeStampToTime(timestamp) {
  const date = new Date(timestamp * 1000);
  const hours = '0' + date.getHours();
  const minutes = '0' + date.getMinutes();
  const formattedTime = hours.substr(-2) + ':' + minutes.substr(-2);

  return formattedTime;
}

function initWorkDepartures() {
  fetchWorkDepartures().then(data => renderWorkDepartures(data));

  window.setInterval(() => {
    fetchWorkDepartures().then(data => renderWorkDepartures(data));
  }, TRAM_REFRESH_INTERVAL_MS);
}

function fetchTrainDepartures() {
  return fetch(HSL_TRAINS_URL + '?arrived_trains=0&arriving_trains=0&departed_trains=0&departing_trains=30&station=' + trainStation)
    .then(res => res.json())
    .then(res => {
      return res
        .filter(train => wantedTrainLines.includes(train.commuterLineID))
        .filter(train => !train.cancelled)
        .map(train => {
          return {
            line           : train.commuterLineID,
            timestamp      : Math.round(new Date(train.timeTableRows[0].scheduledTime).getTime() / 1000),
            departureTrack : train.timeTableRows[0].commercialTrack
          };
        })
        .sort((a, b) => a.timestamp - b.timestamp)
        .splice(0, 2);
    });
}

function renderTrainDepartures(trains) {
  const markup = `
    <h6 class="departure-title">Junat</h6>
    <ul class="departure-list">
    ${trains.map(train => {
      return `
        <li><strong class="cell">${train.line}</strong> <span class="cell">${timeStampToTime(train.timestamp)}</span> <span class="cell">laituri ${train.departureTrack}</span></li>
      `;
    }).join('')}
    </ul>
  `;
  document.getElementById('departures-train').innerHTML = markup;
}

function initTrainDepartures() {
  fetchTrainDepartures().then(data => renderTrainDepartures(data));

  window.setInterval(() => {
    fetchTrainDepartures().then(data => renderTrainDepartures(data));
  }, TRAIN_REFRESH_INTERVAL_MS);
}

//App

function initializeApp() {
  initMap();
  initTrams();
  initBikeStations();
  initWorkDepartures();
  initTrainDepartures();
}

function ready(fn) {
  if(document.readyState !== 'loading') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}

ready(initializeApp);
