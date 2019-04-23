var defaultZoom = 13.5;

function initialiseMap() {
  mapboxgl.accessToken = 'pk.eyJ1IjoibWlhc2EiLCJhIjoiY2p1dTQyczF6MDcyeTN5bm8xbWFoazBkdiJ9.BI5xVCsJISLyzFAG3W2V-A';
  map = new mapboxgl.Map({
      container: 'map-canvas',
      style: 'mapbox://styles/mapbox/streets-v11',
      zoom: defaultZoom,
      center: [24.9399946, 60.1729721]
  });
  //map.on('moveend', toggleMarkerVisibility)
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

function initializeApp() {
  initialiseMap();
}

function ready(fn) {
  if(document.readyState !== 'loading') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}

ready(initializeApp);