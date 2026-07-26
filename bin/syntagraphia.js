#!/usr/bin/env node
'use strict';

const { main } = require('../lib/cli');
const code = main(process.argv.slice(2));
if (typeof code === 'number') process.exit(code);
