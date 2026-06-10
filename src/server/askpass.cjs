#!/usr/bin/env node
/* GIT_ASKPASS / SSH_ASKPASS bridge: forwards the prompt to the progit server,
   which surfaces a credential modal in the browser; prints the answer to stdout.
   Invoked by git/ssh as: askpass.cjs "<prompt>" */
'use strict';
const http = require('http');

const base = process.env.PROGIT_ASKPASS_URL;
if (!base) process.exit(1);

const url = new URL(base);
url.searchParams.set('prompt', process.argv[2] || '');

const req = http.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => {
    if (res.statusCode !== 200 || data === '') process.exit(1);
    process.stdout.write(data);
    process.exit(0);
  });
});
req.setTimeout(150000, () => {
  req.destroy();
  process.exit(1);
});
req.on('error', () => process.exit(1));
