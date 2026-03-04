const {
    parseStopInput,
    parseMultiLineTripFormat,
    parseEndTripFormat,
    parseAgencyOverride,
    isHeuristicLogValid,
} = require('./functions/lib/parsing');

try {
    console.log('--- Testing Crashes ---');
    // console.log('null body:', parseMultiLineTripFormat(null, 'TTC')); // Would crash
    // console.log('undefined body:', parseMultiLineTripFormat(undefined, 'TTC')); // Would crash
    console.log('Not a string:', parseMultiLineTripFormat(12345, 'TTC')); // Error if it calls .split
} catch (e) {
    console.log('CAUGHT CRASH:', e.message);
}

console.log('\n--- Testing isHeuristicLogValid Lenience ---');
const badRoute = "I am texting my friend about lunch at 1pm";
const validStop = "Dundas West";
console.log(`Stop: "${validStop}", Route: "${badRoute}" -> Valid?`, isHeuristicLogValid(validStop, badRoute));

console.log('\n--- Testing TitleCase Edge Cases ---');
const { toTitleCase } = require('./functions/lib/utils');
console.log('Double space:', `"${toTitleCase('Queen  St')}"`);
console.log('Mixed case with "AND":', `"${toTitleCase('QUEEN and SPADINA')}"`);

console.log('\n--- Testing Agency Override Regex ---');
// What if known agency has special regex characters? (None of the current ones do, but good to check)
// KNOWN_AGENCIES includes "GO Transit"
console.log('GO Transit override:', parseAgencyOverride('501 Queen GO Transit'));

console.log('\n--- Testing Logic "Breaks" (Valid data rejected) ---');
console.log('"To the Beach" stop:', isHeuristicLogValid('To the Beach', '501'));
console.log('"The Esplanade" stop:', isHeuristicLogValid('The Esplanade', '501'));
console.log('"My Home" as a stop:', isHeuristicLogValid('My Home', '501'));
console.log('"Route 66" route as a stop:', isHeuristicLogValid('Route 66', '66'));
