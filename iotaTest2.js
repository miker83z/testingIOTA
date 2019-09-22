const fs = require('fs');
const lineByLine = require('n-readlines');
const liner = new lineByLine('out.csv');
const IOTA = require('@iota/core');
const converter = require('@iota/converter');
const createCsvWriter = require('csv-writer');
const seedrandom = require('seedrandom');
const axios = require('axios');
const shuffle = require('shuffle-array');

const ISRANDOM = false;

let iotaProviders = [];
let busObjs = {};
let latestMilestones = [];
let bestScore = 1;
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

let messageX = '';
for (let i = 0; i < 270; i++) {
  messageX += 'Hello IOTA ';
}

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

// Initial phase, creating log files and opening MAM channels
const init = async () => {
  try {
    // Directory
    let dirTemp = 'data/';
    if (ISRANDOM) dirTemp = 'data-RANDOM/RANDOM-';
    const dir = dirTemp + new Date().toISOString();

    // Get public IOTA nodes
    const resAx = await axios.get('https://api.iota-nodes.net/');
    // Check for latest global milestone index
    resAx.data.forEach(p => {
      if (
        p.hasPOW === 1 &&
        p.isSSL &&
        !latestMilestones.includes(p.latestMilestoneIndex)
      )
        latestMilestones.push(p.latestMilestoneIndex);
    });
    latestMilestones = latestMilestones.sort((a, b) => {
      return b - a;
    });
    // Calculate scores for providers
    resAx.data.forEach(p => {
      if (
        p.hasPOW === 1 &&
        p.isSSL &&
        (ISRANDOM || p.latestMilestoneIndex === p.latestSolidSubtangleIndex)
      )
        iotaProviders.push({
          hostname: 'https://' + p.hostname + ':' + p.port,
          score:
            (p.freeMemory / p.maxMemory) *
            p.processors *
            p.neighbors *
            (2 + 1 / (1 + p.load)) *
            (10 / (10 + latestMilestones[0] - p.latestMilestoneIndex))
        });
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
      iotaProviders = iotaProviders.slice(0, bus.length);
      shuffle(iotaProviders, { rng: seedrandom() });
    }

    // For each bus create a MAM channel, then the log file
    for (let i = 0; i < bus.length; i++) {
      // Bus object
      busObjs[bus[i]] = {
        channel: null,
        csv: null,
        seed: iotaSeedGen('seed9999999' + bus[i])
      };
      // Create MAM Channel
      let provider = null;
      if (ISRANDOM) {
        provider = selectRandomProvider();
      } else {
        provider = selectProvider(i);
      }
      const tempChannel = IOTA.composeAPI({ provider: provider.hostname });
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
          '\n',
        err => {
          if (err) throw err;
        }
      );
    }
  } catch (error) {
    console.log(error);
  }
};

// Publishing a message json on a channel
const publish = async (row, json) => {
  try {
    const transfers = [
      {
        address: iotaSeedGen('recipient9999999kh' + new Date()),
        value: 0, // 1Ki
        tag: '', // optional tag of `0-27` trytes
        message: converter.asciiToTrytes(
          JSON.stringify({
            payload: messageX,
            timestamp: new Date().getTime()
          })
        ) // optional message in trytes
      }
    ];
    const startTime = new Date().getTime();
    // Prepare a bundle and signs it.
    const trytes = await busObjs[row[1]].channel.prepareTransfers(
      busObjs[row[1]].seed,
      transfers
    );
    // Does tip selection, attaches to tangle by doing PoW and broadcasts.
    const bundle = await busObjs[row[1]].channel.sendTrytes(trytes, 3, 14);

    //console.log(bundle);
    const attachmentTime = bundle[0].attachmentTimestamp;
    const timeDifference = attachmentTime - startTime;
    console.log('bus ' + row[1] + ': ' + timeDifference + ' ms');

    fs.appendFile(
      busObjs[row[1]].csv,
      timeDifference + ',' + row[4] + '\n',
      err => {
        if (err) throw err;
      }
    );
  } catch (err) {
    console.log(err);
    fs.appendFile(busObjs[row[1]].csv, '-1' + ',' + row[4] + '\n', err => {
      if (err) throw err;
    });
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

      publish(row, {
        payload: { latitude: row[2], longitude: row[3] },
        timestampISO: new Date().toISOString()
      });
    }
  } catch (error) {
    console.log(error);
  }
};

const main = async () => {
  await init();
  await go();
  console.log('Finished approximately at : ' + new Date().toString());
};

main();
