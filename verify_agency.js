const { parseAgencyOverride } = require('./functions/lib/parsing');

console.log('--- Testing Agency Override ---');
console.log('Exact match "TTC":', parseAgencyOverride('TTC'));
console.log('Exact match "translink":', parseAgencyOverride('translink'));
console.log('Ends with " go transit":', parseAgencyOverride('501 Queen go transit'));
console.log('No match "Hello":', parseAgencyOverride('Hello'));
