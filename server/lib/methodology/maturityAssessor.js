'use strict';

const { operationsTrack, growthTrack } = require('./knowledgeBase');

function passesThreshold(value, threshold) {
  if (typeof threshold === 'boolean') return value === threshold;
  if (typeof threshold === 'number') return typeof value === 'number' && value >= threshold;
  return false;
}

function assessTrack(track, tenantData) {
  let currentLevel = 0;
  const allActivePassing = [];

  for (let n = 1; n < track.length; n++) {
    const levelDef = track[n];
    if (!levelDef.indicators.length) continue;

    const passing = levelDef.indicators.filter(i =>
      passesThreshold(tenantData[i.dataField], i.threshold)
    );

    if (passing.length === 0) break;

    currentLevel = n;
    allActivePassing.push(...passing);

    const passRate = passing.length / levelDef.indicators.length;
    if (passRate < 0.6) break;
  }

  const currentDef = track[currentLevel];
  const currentFailing = currentDef.indicators.filter(i =>
    !passesThreshold(tenantData[i.dataField], i.threshold)
  );

  const nextLevelIdx = currentLevel + 1;
  let nextLevel = null;
  if (nextLevelIdx < track.length) {
    const nextDef = track[nextLevelIdx];
    const gapIndicators = nextDef.indicators.filter(i =>
      !passesThreshold(tenantData[i.dataField], i.threshold)
    );
    nextLevel = { level: nextDef.level, name: nextDef.name, gapIndicators };
  }

  return {
    level: currentDef.level,
    levelName: currentDef.name,
    activeIndicators: allActivePassing,
    failingIndicators: currentFailing,
    nextLevel,
  };
}

function assessMaturity(tenantData) {
  return {
    ops: assessTrack(operationsTrack, tenantData),
    growth: assessTrack(growthTrack, tenantData),
  };
}

module.exports = { assessMaturity };
