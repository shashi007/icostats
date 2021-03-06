/**
 * This worker periodically fetches the latest price of assets from 3rd party
 * APIs, and saves them to the db.
 */
/* eslint-disable camelcase */
import Ticker from 'models/ticker';
import icoData from 'lib/ico-data';
import winston from 'winston';

const ONE_SECOND = 1000;
const ONE_MINUTE = ONE_SECOND * 60;
const FIVE_MINUTES = ONE_MINUTE * 5;
let ref;

export default function initTickerWorker() {
  const tickers = [
    ...icoData.filter(ico => !!ico.ticker).map(ico => ico.ticker),
    'ethereum',
    'bitcoin'
  ];

  if (!ref) {
    saveAllTickers(tickers);
    ref = recursiveSyncTicker(tickers, 0);
  }
}

async function recursiveSyncTicker(tickers, index) {
  const ticker = tickers[index];
  const nextIndex = (index === tickers.length - 1) ? 0 : (index + 1);

  try {
    const data = await fetchTicker(ticker);

    await saveTicker(data);
  } catch (err) {
    winston.error(`Failed to fetch ticker for ${ticker}: ${err.message}`);
  }

  setTimeout(() => recursiveSyncTicker(tickers, nextIndex), FIVE_MINUTES);
}

async function fetchTicker(ticker) {
  const url = `https://api.coinmarketcap.com/v1/ticker/${ticker}/`;
  const response = await fetch(url);
  const json = await response.json();

  return json[0];
}

async function saveAllTickers(tickers) {
  const promises = tickers.map(ticker => fetchTicker(ticker).then(saveTicker));

  await Promise.all(promises);
}

async function saveTicker(ticker) {
  const MILLI = 1000;
  const { id, last_updated, price_usd, symbol, price_btc } = ticker;
  const query = {
    ticker: id
  };
  const doc = {
    symbol,
    price_btc: +price_btc,
    timestamp: new Date(+last_updated * MILLI),
    price_usd: +price_usd,
    volume_usd_24h: ticker['24h_volume_usd']
  };
  const options = {
    upsert: true
  };

  await Ticker.findOneAndUpdate(query, doc, options);
}
