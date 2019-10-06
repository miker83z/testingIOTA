const fs = require('fs');
const lineByLine = require('n-readlines');
const liner = new lineByLine('out.csv');
const createCsvWriter = require('csv-writer');
const seedrandom = require('seedrandom');
const axios = require('axios');
const shuffle = require('shuffle-array');

const IOTA = require('@iota/core');
const converter = require('@iota/converter');
const tconverter = require('@iota/transaction-converter');
const MAM = require('@iota/mam');

// Command line arguments
const optionDefinitions = [
  { name: 'notmam', alias: 'n', type: Boolean, defaultValue: false },
  { name: 'random', alias: 'r', type: Boolean, defaultValue: false },
  { name: 'devnet', alias: 'd', type: Boolean, defaultValue: false },
  { name: 'showpow', alias: 'p', type: Boolean, defaultValue: false },
  { name: 'single', alias: 't', type: Boolean, defaultValue: false },
  { name: 'mul', alias: 'x', type: Number, defaultValue: 3 },
  { name: 'iter', alias: 'i', type: Number, defaultValue: 1 },
  { name: 'slice', alias: 's', type: Number, defaultValue: 20 }
];
const commandLineArgs = require('command-line-args');
const options = commandLineArgs(optionDefinitions);

// Path defining attributes
let ISNOTMAM = options.notmam;
const ISRANDOM = options.random;
const ISDEVNET = options.devnet;
const SHOWPOW = options.showpow;
let multiplier = options.mul;
if (options.single) {
  ISNOTMAM = true;
  multiplier = 1;
}
const iterations = options.iter ? options.iter : 1;
const sliceValue = options.slice ? options.slice : 20;

// Constant Values
const devnetProv = {
  hostname: 'https://nodes.devnet.thetangle.org:443',
  score: 1
};
const bus = [
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
let iotaProviders, busObjs, latestMilestones, bestScore, messageX;

const setupEnvironment = () => {
  iotaProviders = [];
  busObjs = {};
  latestMilestones = [];
  bestScore = 1;
  if (ISNOTMAM) {
    messageX = '';
    for (let i = 0; i < 95 * multiplier; i++) {
      messageX += 'Hello IOTA ';
    }
  }
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

const selectProvider = x => {
  return iotaProviders[x % iotaProviders.length];
};

const selectRandomProvider = () => {
  return shuffle.pick(iotaProviders, { rng: seedrandom() });
};

const setupProviders = async () => {
  // Get public IOTA nodes
  const resAx = await axios.get('https://api.iota-nodes.net/');
  // Check for latest global milestone index
  resAx.data.forEach(p => {
    if (p.hasPOW === 1 && !latestMilestones.includes(p.latestMilestoneIndex))
      latestMilestones.push(p.latestMilestoneIndex);
  });
  latestMilestones = latestMilestones.sort((a, b) => {
    return b - a;
  });
  // Calculate scores for providers
  resAx.data.forEach(p => {
    if (
      p.hasPOW === 1 &&
      (ISRANDOM || p.latestMilestoneIndex === p.latestSolidSubtangleIndex)
    ) {
      const pref = p.isSSL ? 'https://' : 'http://';
      iotaProviders.push({
        hostname: pref + p.hostname + ':' + p.port,
        score:
          (p.freeMemory / p.maxMemory) *
          p.processors *
          p.neighbors *
          (2 + 1 / (1 + p.load)) *
          (10 / (10 + latestMilestones[0] - p.latestMilestoneIndex))
      });
    }
  });
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
};

// Initial phase, creating log files and opening MAM channels
const init = async () => {
  try {
    // Directory
    let dirTemp = 'dataset/data';
    if (multiplier === 1) dirTemp += 't';
    if (SHOWPOW && ISNOTMAM) dirTemp += '-POW';
    if (ISRANDOM) dirTemp += '-RANDOM/RANDOM-';
    else dirTemp += '/';
    const dir = dirTemp + new Date().toISOString();

    if (ISDEVNET) iotaProviders.push(devnetProv);
    else await setupProviders();

    // For each bus setup a MAM channel or IOTA api, then create a log file
    for (let i = 0; i < bus.length; i++) {
      const seed = iotaSeedGen();
      // Bus object
      busObjs[bus[i]] = {
        channel: null,
        csv: null,
        seed
      };

      // Setup MAM Channel or IOTA api
      // Provider
      let provider = null;
      if (ISRANDOM) provider = selectRandomProvider();
      else provider = selectProvider(i);
      // Channel
      let tempChannel = null;
      if (ISNOTMAM)
        tempChannel = IOTA.composeAPI({ provider: provider.hostname });
      else {
        tempChannel = MAM.init(provider.hostname, seed);
        tempChannel = MAM.changeMode(tempChannel, 'private');
      }
      busObjs[bus[i]].channel = tempChannel;

      // Create log file
      if (!fs.existsSync(dir)) fs.mkdirSync(dir);
      const filepath = (busObjs[bus[i]].csv = dir + '/bus-' + bus[i] + '.csv');
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
    const trytes = await busObjs[row[1]].channel.prepareTransfers(
      busObjs[row[1]].seed,
      transfers
    );
    // Does tip selection, attaches to tangle by doing PoW and broadcasts.
    //const bundle = await busObjs[row[1]].channel.sendTrytes(trytes, 3, 14);
    const { trunkTransaction, branchTransaction } = await busObjs[
      row[1]
    ].channel.getTransactionsToApprove(3);
    tipsObtainedTime = new Date().getTime();

    const attachedTrytes = await busObjs[row[1]].channel.attachToTangle(
      trunkTransaction,
      branchTransaction,
      14,
      trytes
    );
    await busObjs[row[1]].channel.storeAndBroadcast(attachedTrytes);
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
      busObjs[row[1]].csv,
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
    const message = MAM.create(busObjs[row[1]].channel, trytes);
    busObjs[row[1]].channel = message.state;

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
      busObjs[row[1]].csv,
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
