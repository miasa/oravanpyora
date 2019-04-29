var defaultZoom = 13.5;
var markers = [];

function initialiseMap() {
  mapboxgl.accessToken = 'pk.eyJ1IjoibWlhc2EiLCJhIjoiY2p1dTQyczF6MDcyeTN5bm8xbWFoazBkdiJ9.BI5xVCsJISLyzFAG3W2V-A';
  map = new mapboxgl.Map({
    container : 'map-canvas',
    style     : 'mapbox://styles/mapbox/streets-v11',
    zoom      : defaultZoom,
    center    : [24.9399946, 60.1729721]
  });
  //map.on('moveend', toggleMarkerVisibility);
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

/*
function toggleMarkerVisibility() {
  var bounds = map.getBounds();
  console.log('map bounds', bounds);
  markers.forEach(function(marker) {
    var markerObject = marker.markerObject;
    var markerPos = markerObject.getLngLat();
    markerObject.setVisible(inBounds(markerObject.getLngLat()));
    console.log('marker', marker, markerPos, inBounds(markerPos));
  })
}

function inBounds(pos) {
  const bounds = map.getBounds();
  const lng = (pos.lng - bounds['_ne']['lng']) * (pos.lng - bounds['_sw']['lng']) < 0;
  const lat = (pos.lat - bounds['_ne']['lat']) * (pos.lat - bounds['_sw']['lat']) < 0;
  return lng && lat;
}

function setMarkerVisibility(marker) {
  marker.markerObject.addTo(map);
}
*/

function createStation(stationObject) {
  var bikesAvailable = parseInt(stationObject.bikesAvailable);
  var labelContent = '<div class="count">' + bikesAvailable + '</div>';
  var stationStatus = bikesAvailable >= 3 ? 'plenty' : 'few';

  var el = document.createElement('div');
  el.className = `bikestation-marker status-${stationStatus}`;
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
  //setMarkerVisibility(stationMarker);
}


function getJSON(url, callback) {
  var request = new XMLHttpRequest();
  request.open('GET', url, true);

  request.onload = function() {
    if(this.status >= 200 && this.status < 400) {
      var data = JSON.parse(this.response);
      callback(data);
    }
  };

  request.send();
}

function initializeApp() {
  initialiseMap();

  getJSON('/api/stations', function(data) {
    console.log('api data', data);
    data.bikeStations.map(createStation);
  });
}

function ready(fn) {
  if(document.readyState !== 'loading') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}

ready(initializeApp);