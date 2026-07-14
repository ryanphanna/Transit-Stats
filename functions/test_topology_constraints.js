const test = require('node:test');
const assert = require('node:assert');
const { PredictionEngine } = require('./lib/predict');

function makeTrip({ endStopName, daysAgo }) {
  const startTime = new Date();
  startTime.setDate(startTime.getDate() - daysAgo);
  return {
    route: '510',
    startStopName: 'Spadina Station',
    endStopName,
    direction: 'Southbound',
    startTime,
    endTime: new Date(startTime.getTime() + 5 * 60000),
  };
}

test('V3 topology constraint vetoes conflicting learned NetworkEngine stops', () => {
  PredictionEngine.stopsLibrary = [];
  PredictionEngine.networkGraph = {
    edges: {
      wrong: {
        fromStop: 'Spadina Station',
        toStop: 'Spadina Ave at Nassau St',
        direction: 'Southbound',
        tripCount: 5,
      },
    },
  };

  const history = [
    ...Array.from({ length: 8 }, (_, i) => makeTrip({
      endStopName: 'Spadina Ave at Nassau St',
      daysAgo: i + 1,
    })),
    makeTrip({
      endStopName: 'Spadina Ave at Nassau St South Side',
      daysAgo: 1,
    }),
  ];

  try {
    const constraint = PredictionEngine.getEndStopConstraint({
      route: '510',
      startStopName: 'Spadina Station',
      direction: 'Southbound',
    });
    const top = PredictionEngine.guessTopEndStops(history, {
      route: '510',
      startStopName: 'Spadina Station',
      direction: 'Southbound',
      time: new Date(),
    }, 3);

    assert.equal(constraint.source, 'topology+network');
    assert.ok(top.some(prediction => prediction.stop === 'Spadina Ave at Nassau St South Side'));
    assert.ok(!top.some(prediction => prediction.stop === 'Spadina Ave at Nassau St'));
  } finally {
    PredictionEngine.networkGraph = null;
    PredictionEngine.stopsLibrary = [];
  }
});
