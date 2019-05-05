var defaultZoom = 13.5;
var markers = [];
var client;

const HSL_GRAPHQL_URL = 'https://api.digitransit.fi/routing/v1/routers/hsl/index/graphql';
const HSL_MQTT_URL = 'mqtts://mqtt.hsl.fi:443/';
const HSL_MQTT_TRAM_URL = '/hfp/v1/journey/ongoing/tram/#';

const wantedTramLines = ['1','3','6'];
const wantedBikeStations = [
  '021', //Töölönlahdenkatu
  '022', //Rautatientori, länsi
  '023', //Kiasma
  '006', //Hietalahdentori
  '067', //Perämiehenkatu
  '005'  //Sepänkatu
];

function initialiseMap() {
  mapboxgl.accessToken = 'pk.eyJ1IjoibWlhc2EiLCJhIjoiY2p1dTQyczF6MDcyeTN5bm8xbWFoazBkdiJ9.BI5xVCsJISLyzFAG3W2V-A';

  map = new mapboxgl.Map({
    container : 'map-canvas',
    style     : 'mapbox://styles/miasa/cjvb962rs12y61fkxql06jhj2',
    zoom      : defaultZoom,
    center    : [24.9399946, 60.1729721]
  });

  moveToUserLocation();
}

function moveToUserLocation() {
  var geoTracker = new mapboxgl.GeolocateControl({
    fitBoundsOptions: {
      maxZoom: defaultZoom
    },
    trigger: true
  });

  map.addControl(geoTracker);

  setTimeout(function() {
    geoTracker.trigger();
  }, 800);
}

function getStationStatus(bikesAvailable) {
  return bikesAvailable >= 3 ? 'plenty' : 'few';
}

function createStation(stationObject) {
  var bikesAvailable = parseInt(stationObject.bikesAvailable);
  var labelContent = '<div class="count">' + bikesAvailable + '</div>';
  var stationStatus = getStationStatus(bikesAvailable);

  var el = document.createElement('div');
  el.className = `bikestation-marker status-${stationStatus} station-${stationObject.stationId}`;
  el.innerHTML = labelContent;

  var markerObject = new mapboxgl.Marker({
    element : el,
    anchor  : 'center'
  }).setLngLat([stationObject.lon, stationObject.lat]);

  var stationMarker = {
    markerObject : markerObject,
    id           : stationObject.stationId,
    type         : 'station'
  };

  markers.push(stationMarker);
  stationMarker.markerObject.addTo(map);
}

function createTram(tramObject) {
  var el = document.createElement('div');
  el.className = `tram-marker tram-` + tramObject.id;
  el.innerHTML = '<div class="line">' + tramObject.line + '</div><div class="direction"></div>';

  var markerObject = new mapboxgl.Marker({
    element : el,
    anchor  : 'center'
  }).setLngLat([tramObject.lon, tramObject.lat]);

  var tramnMarker = {
    markerObject : markerObject,
    id           : tramObject.id,
    type         : 'tram'
  };

  markers.push(tramnMarker);
  tramnMarker.markerObject.addTo(map);
}

function updateTram(tramObject) {
  var element = document.querySelector('.tram-' + tramObject.id);
  if(element) {
      var markerObject = getMarker(tramObject.id).markerObject;
      markerObject.setLngLat([tramObject.lon, tramObject.lat]);
      updateTramDirection(element, tramObject.hdg);
  }
}

function updateTramDirection(element, direction) {
  var directionElement = element.querySelector('.direction');
  if(typeof direction === 'number') {
    directionElement.style.transform = 'rotate(' + direction + 'deg)';
    directionElement.classList.remove('hidden');
  } else {
    directionElement.classList.add('hidden');
  }
}

function markerExists(id) {
  return markers.some(marker => marker.id === id);
}

function getMarker(id) {
  const index = markers.findIndex(marker => marker.id === id);
  return markers[index];
}

function createOrUpdateTram(tramObject) {
  if(markerExists(tramObject.id)) {
    updateTram(tramObject);
  } else {
    createTram(tramObject);
  }
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

function createOrUpdateBikeStations(stationObjects) {
  stationObjects.forEach(stationObject => {
    if(markerExists(stationObject.stationId)) {
      updateBikeStation(stationObject);
    } else {
      createStation(stationObject);
    }
  });
}

function updateBikeStation(stationObject) {
  var element = document.querySelector('.station-' + stationObject.stationId);
  if(element) {
    const bikesAvailable = parseInt(stationObject.bikesAvailable);
    const stationStatus = getStationStatus(bikesAvailable)
    element.querySelector('.count').innerHTML = bikesAvailable;
    element.classList.forEach(className => {
      if(className.startsWith('station-')) {
        element.classList.remove(className);
      }
    });
    element.classList.add(`station-${stationStatus}`);
  }
}

function initBikeStations() {
  fetchBikeStations().then(data => createOrUpdateBikeStations(data));
  window.setInterval(() => {
    fetchBikeStations().then(data => createOrUpdateBikeStations(data));
  }, 10000);
}

function initializeApp() {
  initialiseMap();
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
};

/****************************/

ready(initializeApp);