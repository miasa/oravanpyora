const express = require('express');
const compress = require('compression');
const helmet = require('helmet');
const fetch = require('node-fetch');

const HSL_GRAPHQL_URL = 'https://api.digitransit.fi/routing/v1/routers/hsl/index/graphql';
const port = process.env.PORT || 3000;
const app = express();

const wantedStations = [
  '021', //Töölönlahdenkatu
  '022', //Rautatientori, länsi
  '023', //Kiasma
  '006', //Hietalahdentori
  '067', //Perämiehenkatu
  '005' //Sepänkatu
];
let stationCache = {};

//Harden just a little bit
app.use(compress());
app.use(helmet());

//Start app
app.listen(port, () => {
  console.log(`Oravanpyörä listening on http://localhost:${port}`);
  setInterval(refreshBikeStationCache, 5 * 1000);
  refreshBikeStationCache();
});

//index
app.use(express.static('./public')); //, {maxAge: 30 * 60 * 1000}))

//API
app.get('/api/stations', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=5');
  res.json({
    bikeStations: stationCache
  });
});

function refreshBikeStationCache() {
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

  fetch(HSL_GRAPHQL_URL, {
    method  : 'post',
    body    : JSON.stringify({query: query}),
    headers : { 'Content-Type': 'application/json'},
  })
  .then(res => res.json())
  .then(res => {
    stationCache = res.data.bikeRentalStations
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
      .filter(station => wantedStations.includes(station.stationId));
  });
}