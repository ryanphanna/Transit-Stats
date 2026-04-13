const { PredictionEngineV4 } = require('./lib/predict_v4.js');

function testManual(stopName, hour, dayOfWeek) {
  // Construct a fake date that matches the specified hour and dayOfWeek
  // getDay() returns 0 for Sun, 1 for Mon... 6 for Sat
  // Let's create a base date and adjust it so its getDay() matches our target
  const now = new Date();
  const currentDay = now.getDay();
  const daysToAdd = (dayOfWeek - currentDay + 7) % 7;
  
  now.setDate(now.getDate() + daysToAdd);
  now.setHours(hour, 0, 0, 0);

  const pyDay = (now.getDay() + 6) % 7;
  console.log(`\nTesting | Stop: "${stopName}" | Hour: ${hour}:00 | PyDay: ${pyDay} (JS Day ${now.getDay()})`);

  const result = PredictionEngineV4.guess({
    stopName: stopName,
    time: now
  });

  console.log(`Prediction: Route ${result.route} (V4 Confidence: ${result.confidence}%)`);
}

// Emulate the two tests from the bottom of your Python Notebook!
// Python test 1: 'york university', hour=8, day_of_week=0 (Monday)
// In JS, Monday is 1
testManual('york university', 8, 1);

// Python test 2: 'spadina station', hour=17, day_of_week=1 (Tuesday)
// In JS, Tuesday is 2
testManual('spadina station', 17, 2);

// Add your own manual test cases here!
// testManual('your stop name', 14, 3); // Wednesday 2pm
