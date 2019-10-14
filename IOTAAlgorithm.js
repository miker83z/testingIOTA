const fs = require('fs');
const lineByLine = require('n-readlines');
const liner = new lineByLine('out.csv');
const createCsvWriter = require('csv-writer');
const seedrandom = require('seedrandom');
const axios = require('axios');
const shuffle = require('shuffle-array');
const MAM = require('@iota/mam');
const converter = require('@iota/converter');

// Command line arguments
const optionDefinitions = [
  { name: 'random', alias: 'r', type: Boolean, defaultValue: false }
];
const commandLineArgs = require('command-line-args');
const options = commandLineArgs(optionDefinitions);
const ISRANDOM = options.random;

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
let iotaProviders, bus, latestMilestones, previousFetch;

const setupEnvironment = () => {
  iotaProviders = [];
  bus = {};
  latestMilestones = [];
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
        latestMil: p.latestMilestoneIndex
      });
      if (!latestMilestones.includes(p.latestMilestoneIndex))
        latestMilestones.push(p.latestMilestoneIndex);
    }
  });
  // Sort in order to find latest milestone
  latestMilestones = latestMilestones.sort((a, b) => {
    return b - a;
  });
};

const fetchRandomProvider = async () => {
  // If public providers have not been fetched recently
  let actualTime = new Date().getTime();
  if (actualTime > previousFetch + providersFetchInterval) {
    previousFetch = actualTime;
    await setupProviders();
  }
  // Return a synced provider
  let provider;
  while (
    (provider = shuffle.pick(iotaProviders, { rng: seedrandom() }))
      .latestMil !== latestMilestones[0]
  );
  return provider.hostname;
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
    if (!bus[b].waiting.has(provider)) return provider;
  }
  return orderedBestProviders[0][0]; // Should never occur
};

// Initial phase, creating log files and opening MAM channels
const init = async () => {
  try {
    // Directory
    let dirTemp = 'dataset/data-ALG';
    if (ISRANDOM) dirTemp += '-RANDOM';
    dirTemp += '/';
    const dir = dirTemp + new Date().toISOString();

    // For each bus setup a MAM channel, then create a log file
    for (let i = 0; i < busConst.length; i++) {
      const tempProvider = await fetchRandomProvider();
      // Bus object
      bus[busConst[i]] = {
        channel: null,
        csv: null,
        currentProvider: tempProvider,
        providersRTT: {},
        waiting: new Set()
      };
      bus[busConst[i]].providersRTT[tempProvider] = -1;

      // Setup MAM Channel
      bus[busConst[i]].channel = MAM.changeMode(
        MAM.init(tempProvider, iotaSeedGen()),
        'private'
      );

      // Create log file
      if (!fs.existsSync(dir)) fs.mkdirSync(dir);
      const filepath = (bus[busConst[i]].csv =
        dir + '/bus-' + busConst[i] + '.csv');
      fs.writeFile(
        filepath,
        'attach,' + MAM.getRoot(bus[busConst[i]].channel) + '\n',
        err => {
          if (err) throw err;
        }
      );
    }
  } catch (error) {
    console.log('SETUP ERROR: ' + error);
  }
};

// Publishing a message json on a channel
const publishOnMAM = async (b, id, json) => {
  let startTS = -1,
    attachmentTS = -1,
    finishTS = -1,
    p = bus[b].currentProvider;

  try {
    if (ISRANDOM) {
      p = await fetchRandomProvider();
    } else {
      // Choose the provider to use
      // If current provider is in "waiting" for an attachment process, choose another one
      if (bus[b].waiting.has(bus[b].currentProvider)) {
        // If there are known providers not waiting, choose the best one
        if (bus[b].waiting.size < Object.keys(bus[b].providersRTT).length)
          p = selectBestKnownProvider(b);
        // If every known provider is waiting for an attachment, search for a new one
        else {
          // If the provider found is aready known, search for a new one
          while (
            Object.keys(bus[b].providersRTT).includes(
              (p = await fetchRandomProvider())
            )
          );
          // Add the new provider to the known
          bus[b].providersRTT[p] = -1;
        }
      }
    }

    bus[b].currentProvider = p;
    MAM.setIOTA(p); // There is only one MAM object instance for every bus channel

    // Waiting provider
    bus[b].waiting.add(p);

    // Prepare message
    const trytes = converter.asciiToTrytes(JSON.stringify(json));
    const message = MAM.create(bus[b].channel, trytes);
    bus[b].channel = message.state;

    // Attach the payload to the channel
    startTS = new Date().getTime();
    const bundle = await MAM.attach(message.payload, message.address, 3, 14);
    finishTS = new Date().getTime();
    attachmentTS = bundle[0].attachmentTimestamp;

    // Not waiting provider
    bus[b].waiting.delete(p);

    // Compute latency
    tmpRTT = bus[b].providersRTT[p];
    r = finishTS - startTS;
    if (tmpRTT > 0)
      bus[b].providersRTT[p] = Math.ceil(tmpRTT - alpha * (tmpRTT - r));
    else bus[b].providersRTT[p] = r;

    console.log('bus ' + b + ': ' + r + ' ms, ' + p);
  } catch (err) {
    console.log(b + ': ' + err);
  } finally {
    fs.appendFile(
      bus[b].csv,
      startTS + ',' + attachmentTS + ',' + finishTS + ',' + id + ',' + p + '\n',
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

      publishOnMAM(row[1], row[4], {
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

for (let i = 0; i < 1; i++) {
  main();
}
