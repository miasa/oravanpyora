const express = require('express');
const compress = require('compression');
const helmet = require('helmet');

const port = process.env.PORT || 3000;
const app = express();

//Harden just a little bit
app.use(compress());
app.use(helmet());

//Start app
app.listen(port, () => {
  console.log(`Oravanpyörä listening on http://localhost:${port}`);
});

//index
app.use(express.static('./public')); //, {maxAge: 30 * 60 * 1000}))