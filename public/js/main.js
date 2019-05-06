//Settings
const HSL_GRAPHQL_URL = 'https://api.digitransit.fi/routing/v1/routers/hsl/index/graphql';
const HSL_MQTT_URL = 'mqtts://mqtt.hsl.fi:443/';
const HSL_MQTT_TRAM_URL = '/hfp/v1/journey/ongoing/tram/#';
const MAPBOX_TOKEN = 'pk.eyJ1IjoibWlhc2EiLCJhIjoiY2p1dTQyczF6MDcyeTN5bm8xbWFoazBkdiJ9.BI5xVCsJISLyzFAG3W2V-A';
const MAPBOX_STYLE = 'mapbox://styles/miasa/cjvb962rs12y61fkxql06jhj2';
const MAPBOX_DEFAULT_ZOOM = 13.5;

//Filters
const wantedTramLines = ['1','3','6'];
const wantedBikeStations = [
  '021', //Töölönlahdenkatu
  '022', //Rautatientori, länsi
  '023', //Kiasma
  '006', //Hietalahdentori
  '067', //Perämiehenkatu
  '005'  //Sepänkatu
];

//----------------------------

const markers = [];
let client;

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
  el.className = `bikestation-marker bikestation-${stationObject.stationId} status-${stationStatus}`;
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
  }, 10000);
}

//Trams

function createTram(tramObject) {
  const el = document.createElement('div');
  el.className = `tram-marker tram-` + tramObject.id;
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

//App

function initializeApp() {
  initMap();
  initTrams();
  initBikeStations();
}

function ready(fn) {
  if(document.readyState !== 'loading') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}

ready(initializeApp);
