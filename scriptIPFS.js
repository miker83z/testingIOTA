const fs = require('fs');
const lineByLine = require('n-readlines');
const createCsvWriter = require('csv-writer');
const ipfsAPI = require('ipfs-http-client');
const ipfs = ipfsAPI({
  host: 'ipfs.infura.io',
  port: '5001',
  protocol: 'https'
});

// Constant Values
const inputBuses = 'inputDatasetIPFS.csv';
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
let bus;

const setupEnvironment = () => {
  bus = {};
};

const sleep = ms => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Initial phase, creating log files and opening MAM channels
const init = async () => {
  try {
    // Directory
    let dirTemp = 'datasetIPFS/dataInfura';
    if (!fs.existsSync(dirTemp)) fs.mkdirSync(dirTemp);
    const dir = dirTemp + '/' + new Date().toISOString();

    // For each bus setup a MAM channel or IOTA api, then create a log file
    for (let i = 0; i < busConst.length; i++) {
      // Bus object
      bus[busConst[i]] = {
        csv: null
      };

      // Create log file
      if (!fs.existsSync(dir)) fs.mkdirSync(dir);
      const filepath = (bus[busConst[i]].csv =
        dir + '/bus-' + busConst[i] + '.csv');
      fs.writeFile(filepath, 'IPFS\n', err => {
        if (err) throw err;
      });
      sleep(50);
    }
  } catch (error) {
    console.log('SETUP ERROR: ' + error);
  }
};

// Publishing a message json on a MAM channel or as a single TX
const publish = async (b, id, json) => {
  let startTS = -1,
    finishTS = -1;
  try {
    //Start operations
    startTS = new Date().getTime();
    for await (const result of ipfs.add(JSON.stringify(json))) {
      finishTS = new Date().getTime();
      //console.log(result);
      // Latency measures
      r = finishTS - startTS;
      // Log result
      console.log('bus ' + b + ': ' + r + 'ms');
      fs.appendFile(
        bus[b].csv,
        startTS + ',' + finishTS + ',' + id + '\n',
        err => {
          if (err) throw err;
        }
      );
    }
  } catch (err) {
    console.log(b + ': ' + err);
    fs.appendFile(
      bus[b].csv,
      startTS + ',' + finishTS + ',' + id + '\n',
      err => {
        if (err) throw err;
      }
    );
  }
};

// Main phase, reading buses behavior in order to publish messages to MAM channels
const go = async () => {
  const liner = new lineByLine(inputBuses);
  try {
    let line = liner.next(); // read first line
    while ((line = liner.next())) {
      let row = line.toString('ascii').split(',');
      //console.log('Waiting ' + row[0] + ' seconds for bus ' + row[1]);
      console.log('Waiting ' + row[0]);
      await sleep(parseInt(row[0]) * 1000);
      if (busConst.includes(row[1])) {
        console.log('Waited ' + row[0] + ' seconds for bus ' + row[1]);
        publish(row[1], row[4], {
          payload: { latitude: row[2], longitude: row[3] },
          timestampISO: new Date().toISOString()
        });
      }
    }
  } catch (error) {
    console.log(error);
  }
};

const main = async () => {
  //await sleep(30000);
  setupEnvironment();
  await init();
  await go();
  console.log('Finished approximately at : ' + new Date().toString());
};

main();
