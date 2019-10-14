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
  { name: 'keepinitial', alias: 'k', type: Boolean, defaultValue: true },
  { name: 'notmam', alias: 'n', type: Boolean, defaultValue: false },
  { name: 'random', alias: 'r', type: Boolean, defaultValue: false },
  { name: 'localpow', alias: 'l', type: Boolean, defaultValue: false },
  { name: 'showpow', alias: 'p', type: Boolean, defaultValue: false },
  { name: 'devnet', alias: 'd', type: Boolean, defaultValue: false },
  { name: 'single', alias: 't', type: Boolean, defaultValue: false },
  { name: 'mul', alias: 'x', type: Number, defaultValue: 3 },
  { name: 'iter', alias: 'i', type: Number, defaultValue: 1 },
  { name: 'slice', alias: 's', type: Number, defaultValue: 20 },
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
const KEEPINITIALP = options.keepinitial;
let ISNOTMAM = options.notmam;
const ISRANDOM = options.random;
const ISLOCALPOW = options.localpow;
let SHOWPOW = options.showpow;
if (ISLOCALPOW) SHOWPOW = true;
const ISDEVNET = options.devnet;
let multiplier = options.mul;
if (options.single) {
  ISNOTMAM = true;
  multiplier = 1;
}
const iterations = options.iter ? options.iter : 1;
const sliceValue = options.slice ? options.slice : 20;
const ccurlpath = options.ccurl;

// Constant Values
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
let iotaProviders, bus, latestMilestones, bestScore, messageX, previousFetch;

const setupEnvironment = () => {
  iotaProviders = [];
  bus = {};
  latestMilestones = [];
  bestScore = 1;
  if (ISNOTMAM) {
    messageX = '';
    for (let i = 0; i < 95 * multiplier; i++) {
      messageX += 'Hello IOTA ';
    }
  }
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
    return e.latestMil !== latestMilestones[0];
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
      iotaProviders = iotaProviders.slice(0, sliceValue);
      shuffle(iotaProviders, { rng: seedrandom() });
    }
  }
};

const selectProvider = x => {
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

// Initial phase, creating log files and opening MAM channels
const init = async () => {
  try {
    // Directory
    let dirTemp = 'dataset/';
    if (KEEPINITIALP) dirTemp += 'keep/';
    else dirTemp += 'keep-NOT/';
    if (ISNOTMAM) dirTemp += 'mam-NOT/';
    else dirTemp += 'mam/';
    if (ISRANDOM) dirTemp += 'random/';
    else dirTemp += 'random-NOT/';
    if (multiplier === 1) dirTemp += 'single';
    else if (ISNOTMAM) dirTemp += 'triple';
    else dirTemp += 'data';

    if (ISLOCALPOW) dirTemp += '-LOCAL';
    if (SHOWPOW && ISNOTMAM) dirTemp += '-POW';
    if (ISDEVNET) dirTemp += '-DEVNET';

    if (!fs.existsSync(dirTemp)) fs.mkdirSync(dirTemp);
    const dir = dirTemp + '/' + new Date().toISOString();

    if (ISDEVNET) iotaProviders.push(devnetProv);
    else await setupProviders();

    if (ISLOCALPOW) MAM.setAttachToTangle(localAttachToTangle);

    // For each bus setup a MAM channel or IOTA api, then create a log file
    for (let i = 0; i < busConst.length; i++) {
      const seed = iotaSeedGen();
      // Provider
      let provider = null;
      if (ISRANDOM || !KEEPINITIALP) provider = selectRandomProvider();
      else provider = selectProvider(i);
      // Bus object
      bus[busConst[i]] = {
        channel: null,
        csv: null,
        seed,
        currentProvider: provider,
        providersRTT: {},
        waiting: new Set()
      };
      bus[busConst[i]].providersRTT[provider] = -1;

      // Setup MAM Channel or IOTA api
      let tempChannel = null;
      if (ISNOTMAM) {
        tempChannel = IOTA.composeAPI({ provider: provider.hostname });
        if (ISLOCALPOW) tempChannel.attachToTangle = localAttachToTangle;
      } else {
        tempChannel = MAM.changeMode(MAM.init(tempProvider, seed), 'private');
      }
      bus[busConst[i]].channel = tempChannel;

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
          (!ISNOTMAM ? ' ' + MAM.getRoot(tempChannel) : '') +
          '\n',
        err => {
          if (err) throw err;
        }
      );
    }
  } catch (error) {
    console.log('SETUP ERROR: ' + error);
  }
};

// Publishing transactions on IOTA
const publish = async row => {
  let startTime = -1,
    tipsObtainedTime = -1,
    attachmentTime = -1,
    finishTime = -1;
  const transfers = [
    {
      address: iotaSeedGen('recipient9999999kh' + new Date()),
      value: 0,
      tag: '',
      message: converter.asciiToTrytes(
        JSON.stringify({
          payload: messageX,
          timestamp: new Date().getTime()
        })
      )
    }
  ];
  try {
    startTime = new Date().getTime();
    // Prepare a bundle and signs it.
    const trytes = await bus[row[1]].channel.prepareTransfers(
      bus[row[1]].seed,
      transfers
    );
    // Does tip selection, attaches to tangle by doing PoW and broadcasts.
    //const bundle = await bus[row[1]].channel.sendTrytes(trytes, 3, 14);
    const { trunkTransaction, branchTransaction } = await bus[
      row[1]
    ].channel.getTransactionsToApprove(3);
    tipsObtainedTime = new Date().getTime();

    const attachedTrytes = await bus[row[1]].channel.attachToTangle(
      trunkTransaction,
      branchTransaction,
      14,
      trytes
    );
    await bus[row[1]].channel.storeAndBroadcast(attachedTrytes);
    const bundle = attachedTrytes.map(t => tconverter.asTransactionObject(t));
    finishTime = new Date().getTime();
    attachmentTime = bundle[0].attachmentTimestamp;

    // Compute latency
    if (SHOWPOW)
      console.log(
        'bus ' +
          row[1] +
          ': tips ' +
          (tipsObtainedTime - startTime) +
          'ms, pow ' +
          (finishTime - tipsObtainedTime) +
          'ms'
      );
    else
      console.log(
        'bus ' +
          row[1] +
          ': ' +
          (attachmentTime - startTime) +
          ' ms, ' +
          (finishTime - startTime) +
          ' ms'
      );
  } catch (err) {
    console.log(row[1] + ': ' + err);
  } finally {
    fs.appendFile(
      bus[row[1]].csv,
      startTime +
        ',' +
        (SHOWPOW ? tipsObtainedTime + ',' : '') +
        attachmentTime +
        ',' +
        finishTime +
        ',' +
        row[4] +
        '\n',
      err => {
        if (err) throw err;
      }
    );
  }
};

// Publishing a message json on a channel
const publishOnMAM = async (row, json) => {
  let minWeightMagn = 14;
  if (ISDEVNET) minWeightMagn = 9;
  let startTime = -1,
    attachmentTime = -1,
    finishTime = -1;
  try {
    // Prepare message
    const trytes = converter.asciiToTrytes(JSON.stringify(json));
    const message = MAM.create(bus[row[1]].channel, trytes);
    bus[row[1]].channel = message.state;

    // Attach the payload to the channel
    startTime = new Date().getTime();
    const bundle = await MAM.attach(
      message.payload,
      message.address,
      3,
      minWeightMagn
    );
    finishTime = new Date().getTime();
    attachmentTime = bundle[0].attachmentTimestamp;

    // Compute latency
    console.log(
      'bus ' +
        row[1] +
        ': ' +
        (attachmentTime - startTime) +
        ' ms, ' +
        (finishTime - startTime) +
        ' ms'
    );
  } catch (err) {
    console.log(row[1] + ': ' + err);
  } finally {
    fs.appendFile(
      bus[row[1]].csv,
      startTime + ',' + attachmentTime + ',' + finishTime + ',' + row[4] + '\n',
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

      if (ISNOTMAM) publish(row);
      else
        publishOnMAM(row, {
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
