function groupBestOf(categoryName) {
  return String(categoryName || '').trim().toUpperCase() === 'PARKINSONDB' ? 3 : 5;
}

function gamesToWin(bestOf) {
  return Math.floor(Number(bestOf) / 2) + 1;
}

module.exports = { groupBestOf, gamesToWin };
