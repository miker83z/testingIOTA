const fs = require('fs');
const lineByLine = require('n-readlines');
const liner = new lineByLine('out.csv');
const createCsvWriter = require('csv-writer');
const seedrandom = require('seedrandom');
const axios = require('axios');
const shuffle = require('shuffle-array');
const assert = require('assert');

const IOTA = require('@iota/core');
const converter = require('@iota/converter');
const tconverter = require('@iota/transaction-converter');
const MAM = require('@iota/mam');
const ccurl = require('ccurl.interface.js');

// Command line arguments
const optionDefinitions = [
  { name: 'keepinitial', alias: 'k', type: Boolean, defaultValue: false },
  { name: 'single', alias: 's', type: Boolean, defaultValue: false },
  { name: 'random', alias: 'r', type: Boolean, defaultValue: false },
  { name: 'localpow', alias: 'l', type: Boolean, defaultValue: false },
  { name: 'devnet', alias: 'd', type: Boolean, defaultValue: false },
  { name: 'iter', alias: 'i', type: Number, defaultValue: 1 },
  { name: 'window', alias: 'w', type: Number, defaultValue: 10 },
  {
    name: 'ccurl',
    alias: 'c',
    type: String,
    defaultValue: '../ccurl/build/lib'
  }
];
const commandLineArgs = require('command-line-args');
const options = commandLineArgs(optionDefinitions);

// Path defining attributes
let KEEPINITIALP = options.keepinitial;
let ISSINGLE = options.single;
let ISRANDOM = options.random;
const ISLOCALPOW = options.localpow;
const ISDEVNET = options.devnet;
if (ISDEVNET) {
  KEEPINITIALP = true;
  ISRANDOM = false;
}
const iterations = options.iter ? options.iter : 1;
const providersWindow = options.window ? options.window : 10;
const ccurlpath = options.ccurl;

// Constant Values
let mwm = ISDEVNET ? 9 : 14; //minimum weight magnitude
const depth = 3; //depth
const devnetProv = {
  hostname: 'https://nodes.devnet.thetangle.org:443',
  score: 1
};
const providersFetchInterval = 10000;
const alpha = 1 / 4;
const busConst = [
  '110',
  '226',
  '371',
  '426',
  '512',
  '639',
  '650',
  '889',
  '484',
  '422'
];
let iotaProviders, bus, latestMilestones, bestScore, previousFetch;

const setupEnvironment = () => {
  iotaProviders = [];
  bus = {};
  latestMilestones = [];
  bestScore = 1;
  previousFetch = 0;
};

const iotaSeedGen = key => {
  const rng = seedrandom(key);
  const iotaSeedLength = 81;
  const seedCharset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ9';
  let result = '';

  for (let i = 0; i < iotaSeedLength; i++) {
    const x = Math.round(rng() * seedCharset.length) % seedCharset.length;
    result += seedCharset[x];
  }

  return result;
};

const sleep = ms => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

const localAttachToTangle = (
  trunkTransaction,
  branchTransaction,
  minWeightMagnitude,
  trytes,
  callback
) =>
  new Promise((resolve, reject) => {
    ccurl(
      trunkTransaction,
      branchTransaction,
      minWeightMagnitude,
      trytes,
      ccurlpath,
      (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        assert.equal(result.length, trytes.length);
        console.log(trytes.length + ' transactions hashed. OK');
        resolve(result);
      }
    );
  });

// If KEEPINITIALP his function is executed only once
const setupProviders = async () => {
  // Get public IOTA nodes
  const resAx = await axios.get('https://api.iota-nodes.net/');
  // Check for latest global milestone index
  resAx.data.forEach(p => {
    // Only pick providers who execute POW and (internally) synced
    if (
      p.hasPOW === 1 &&
      p.latestMilestoneIndex === p.latestSolidSubtangleIndex
    ) {
      const pref = p.isSSL ? 'https://' : 'http://';
      iotaProviders.push({
        hostname: pref + p.hostname + ':' + p.port,
        latestMil: p.latestMilestoneIndex,
        score:
          (p.freeMemory / p.maxMemory) *
          p.processors *
          p.neighbors *
          (2 + 1 / (1 + p.load))
      });
      if (!latestMilestones.includes(p.latestMilestoneIndex))
        latestMilestones.push(p.latestMilestoneIndex);
    }
  });
  // Sort in order to find latest milestone
  latestMilestones = latestMilestones.sort((a, b) => {
    return b - a;
  });
  iotaProviders = iotaProviders.filter(e => {
    return e.latestMil === latestMilestones[0];
  });
  if (KEEPINITIALP) {
    // Order by score and pick the best score
    iotaProviders = iotaProviders.sort((a, b) => {
      if (a.score < b.score) return 1;
      if (a.score > b.score) return -1;
      return 0;
    });
    bestScore = iotaProviders[0].score;
    // Pick the best n (if not random choice)
    if (!ISRANDOM) {
      iotaProviders = iotaProviders.slice(0, providersWindow);
      shuffle(iotaProviders, { rng: seedrandom() });
    }
  }
};

const selectDifferentProvider = x => {
  return iotaProviders[x % iotaProviders.length];
};

// Return a synced random provider
const selectRandomProvider = () => {
  return shuffle.pick(iotaProviders, { rng: seedrandom() });
};

const fetchRandomProvider = async () => {
  // If public providers have not been fetched recently
  let actualTime = new Date().getTime();
  if (actualTime > previousFetch + providersFetchInterval) {
    previousFetch = actualTime;
    await setupProviders();
  }
  return selectRandomProvider();
};

const selectBestKnownProvider = b => {
  // Order known providers by RTT
  const orderedBestProviders = Array.from(
    Object.keys(bus[b].providersRTT),
    x => [x, bus[b].providersRTT[x]]
  ).sort((a, b) => {
    return a[1] - b[1];
  });
  // Return the best provider that is not waiting
  for (let i = 0; i < orderedBestProviders.length; i++) {
    let provider = orderedBestProviders[i][0];
    if (!bus[b].waiting.has(provider)) return provider; // Assuming synced
  }
  return orderedBestProviders[0][0]; // Should never occur
};

const chooseProviderAlgorithm = async b => {
  let p = bus[b].currentProvider;
  if (ISRANDOM) {
    p = (await fetchRandomProvider()).hostname;
  } else {
    // Choose the provider to use
    // If current provider is in "waiting" for an attachment process, choose another one
    if (bus[b].waiting.has(bus[b].currentProvider)) {
      // If there are known providers not waiting, choose the best one
      if (bus[b].waiting.size < Object.keys(bus[b].providersRTT).length)
        p = selectBestKnownProvider(b).hostname;
      // If every known provider is waiting for an attachment, search for a new one
      else {
        // If the provider found is aready known, search for a new one
        while (
          Object.keys(bus[b].providersRTT).includes(
            (p = (await fetchRandomProvider()).hostname)
          )
        );
        // Add the new provider to the known
        bus[b].providersRTT[p] = -1;
      }
    }
  }
  return p;
};

// Initial phase, creating log files and opening MAM channels
const init = async () => {
  try {
    // Directory
    let dirTemp = 'dataset/';
    if (KEEPINITIALP) dirTemp += 'keep/';
    else dirTemp += 'keep-NOT/';
    if (ISSINGLE) dirTemp += 'single/';
    else dirTemp += 'mam/';
    if (ISRANDOM) dirTemp += 'random/';
    else dirTemp += 'random-NOT/';

    dirTemp += 'data';
    if (ISLOCALPOW) dirTemp += '-LOCAL';
    if (ISDEVNET) dirTemp += '-DEVNET';
    if (!fs.existsSync(dirTemp)) fs.mkdirSync(dirTemp);
    const dir = dirTemp + '/' + new Date().toISOString();

    if (ISDEVNET) iotaProviders.push(devnetProv);
    else await setupProviders();

    // For each bus setup a MAM channel or IOTA api, then create a log file
    for (let i = 0; i < busConst.length; i++) {
      // Provider
      const provider =
        ISRANDOM || !KEEPINITIALP
          ? selectRandomProvider()
          : selectDifferentProvider(i);
      // Bus object
      bus[busConst[i]] = {
        channel: null,
        csv: null,
        currentProvider: provider.hostname,
        providersRTT: {},
        waiting: new Set()
      };
      bus[busConst[i]].providersRTT[provider] = -1;

      // Setup MAM Channel
      if (!ISSINGLE)
        bus[busConst[i]].channel = MAM.changeMode(
          MAM.init(provider.hostname, iotaSeedGen()),
          'private'
        );

      // Create log file
      if (!fs.existsSync(dir)) fs.mkdirSync(dir);
      const filepath = (bus[busConst[i]].csv =
        dir + '/bus-' + busConst[i] + '.csv');
      fs.writeFile(
        filepath,
        'attach,' +
          provider.hostname +
          ' score: ' +
          provider.score +
          ' scoreNorm: ' +
          provider.score / bestScore +
          (!ISSINGLE ? ' ' + MAM.getRoot(bus[busConst[i]].channel) : '') +
          '\n',
        err => {
          if (err) throw err;
        }
      );
      sleep(50);
    }
  } catch (error) {
    console.log('SETUP ERROR: ' + error);
  }
};

const prepareMAMMessage = (b, json) => {
  const trytes = converter.asciiToTrytes(JSON.stringify(json));
  const message = MAM.create(bus[b].channel, trytes);
  bus[b].channel = message.state;
  return [
    {
      address: message.address,
      value: 0,
      message: message.payload,
      tag: ''
    }
  ];
};

const prepareSingleTX = json => {
  return [
    {
      address: iotaSeedGen('r9999999' + new Date()),
      value: 0,
      message: converter.asciiToTrytes(JSON.stringify(json)),
      tag: ''
    }
  ];
};

// Publishing a message json on a MAM channel or as a single TX
const publish = async (b, id, json) => {
  let startTS = -1,
    tipsTS = -1,
    finishTS = -1,
    provider = bus[b].currentProvider;
  try {
    if (!KEEPINITIALP) {
      provider = await chooseProviderAlgorithm(b);
      bus[b].currentProvider = provider;
      bus[b].waiting.add(provider);
    }

    // Prepare message
    const transfers = ISSINGLE
      ? prepareSingleTX(json)
      : prepareMAMMessage(b, json);

    // Prepare API and transaction
    const iota = IOTA.composeAPI({ provider });
    const attachToTangle = ISLOCALPOW
      ? localAttachToTangle
      : iota.attachToTangle;
    const trytes = await iota.prepareTransfers('9'.repeat(81), transfers, {});

    //Start operations
    startTS = new Date().getTime();
    // Tip selection
    const {
      trunkTransaction,
      branchTransaction
    } = await iota.getTransactionsToApprove(depth);
    tipsTS = new Date().getTime();
    // Attaches to tangle by doing PoW and broadcasts.
    const attachedTrytes = await attachToTangle(
      trunkTransaction,
      branchTransaction,
      mwm,
      trytes
    );
    finishTS = new Date().getTime();
    await iota.storeAndBroadcast(attachedTrytes);
    const bundle = attachedTrytes.map(t => tconverter.asTransactionObject(t));

    // Latency measures
    r = finishTS - startTS;
    tps = tipsTS - startTS;
    pw = finishTS - tipsTS;

    if (!KEEPINITIALP) {
      bus[b].waiting.delete(provider);
      // Compute latency
      tmpRTT = bus[b].providersRTT[provider];
      if (tmpRTT > 0)
        bus[b].providersRTT[provider] = Math.ceil(
          tmpRTT - alpha * (tmpRTT - r)
        );
      else bus[b].providersRTT[provider] = r;
    }

    // Log result
    console.log(
      'bus ' + b + ': tips ' + tps + 'ms, pow ' + pw + 'ms, ' + provider
    );
  } catch (err) {
    console.log(b + ': ' + err);
    if (!KEEPINITIALP) {
      bus[b].waiting.delete(provider);
      // Compute latency
      tmpRTT = bus[b].providersRTT[provider];
      if (tmpRTT > 0) bus[b].providersRTT[provider] = 10 * tmpRTT;
      else bus[b].providersRTT[provider] = 100;
    }
  } finally {
    fs.appendFile(
      bus[b].csv,
      startTS +
        ',' +
        tipsTS +
        ',' +
        finishTS +
        ',' +
        id +
        (!KEEPINITIALP ? ',' + provider : '') +
        '\n',
      err => {
        if (err) throw err;
      }
    );
  }
};

// Main phase, reading buses behavior in order to publish messages to MAM channels
const go = async () => {
  try {
    let line = liner.next(); // read first line
    while ((line = liner.next())) {
      let row = line.toString('ascii').split(',');
      console.log('Waiting ' + row[0] + ' seconds for bus ' + row[1]);
      await sleep(parseInt(row[0]) * 1000);

      publish(row[1], row[4], {
        payload: { latitude: row[2], longitude: row[3] },
        timestampISO: new Date().toISOString()
      });
    }
  } catch (error) {
    console.log(error);
  }
};

const main = async () => {
  setupEnvironment();
  await init();
  await go();
  console.log('Finished approximately at : ' + new Date().toString());
};

for (let i = 0; i < iterations; i++) {
  main();
}
