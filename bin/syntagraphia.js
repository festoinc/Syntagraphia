#!/usr/bin/env node
'use strict';

const { main } = require('../lib/cli');

Promise.resolve(main(process.argv.slice(2)))
  .then((code) => { if (typeof code === 'number') process.exit(code); })
  .catch((e) => { process.stderr.write('Error: ' + (e && e.message ? e.message : e) + '\n'); process.exit(1); });
