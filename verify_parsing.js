const {
    parseStopInput,
    parseMultiLineTripFormat,
    parseEndTripFormat,
    parseAgencyOverride,
    isHeuristicLogValid,
} = require('./functions/lib/parsing');

const { KNOWN_AGENCIES } = require('./functions/lib/constants');

console.log('--- Testing parseStopInput ---');
console.log('Empty string:', parseStopInput('')); // Expected: { stopCode: null, stopName: '' }
console.log('Spaces only:', parseStopInput('   ')); // Expected: { stopCode: null, stopName: '' }
console.log('Stop code with space:', parseStopInput('123 45')); // Expected: { stopCode: null, stopName: "123 45" } (Might be bug)

console.log('\n--- Testing parseMultiLineTripFormat ---');
console.log('Command name as route:', parseMultiLineTripFormat('HELP\nMain St', 'TTC')); // Expected: null (Breaks if route is HELP)
console.log('Route with leading/trailing newlines:', parseMultiLineTripFormat('\n\n501\nQueen\n\n', 'TTC')); // Expected: valid object

console.log('\n--- Testing parseEndTripFormat ---');
console.log('Lowercase stop:', parseEndTripFormat('stop')); // Expected: { isEnd: true, ... }
console.log('END with whitespace lines:', parseEndTripFormat('END\n\nUnion\n\nNotes')); // Expected: { stop: "Union", notes: "Notes", ... }

console.log('\n--- Testing parseAgencyOverride ---');
console.log('Only agency name (no space):', parseAgencyOverride('TTC')); // Expected: { agency: null, remainingMessage: "TTC" } (Bug!)
console.log('Sentence ending in agency:', parseAgencyOverride('I am on the TTC')); // Expected: { agency: "TTC", remainingMessage: "I am on the" } (Greedy!)
console.log('Agency with trailing space:', parseAgencyOverride('501 Queen TTC ')); // Expected: { agency: "TTC", remainingMessage: "501 Queen" }

console.log('\n--- Testing isHeuristicLogValid ---');
console.log('Valid stop "To the Beach":', isHeuristicLogValid('To the Beach', '501')); // Expected: false (Bug: "to" keyword)
console.log('Valid stop "Route 66":', isHeuristicLogValid('Route 66', '66')); // Expected: false (Bug: "ROUTE" keyword)
console.log('Gibberish route:', isHeuristicLogValid('Union', 'This is a long sentence that should not be a route')); // Expected: true (Bug: routeRaw not checked)
console.log('Valid stop "Fromm St":', isHeuristicLogValid('Fromm St', '501')); // Expected: true (Good: word boundary works)
