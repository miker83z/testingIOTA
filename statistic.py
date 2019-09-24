import os
import csv

startingDir = 'dataset/datat-RANDOM'


def mean(l):
    tmp = 0
    for x in l:
        tmp += int(x)
    return tmp / len(l)


totalRequests = 447
providersData = {}
correctValues = []
singleTestData = []
errors = 0

path = os.walk(startingDir)
next(path)
for directory in path:
    tempTestData = {
        'name': directory[0].split('/')[2],
        'values': [],
        'pows': [],
        'errors': 0
    }
    for csvFilename in directory[2]:
        with open(directory[0]+'/'+csvFilename, 'r') as csvFile:
            reader = csv.reader(csvFile)
            firstRowProv = next(reader)[1].split(' ')
            provider = firstRowProv[0]
            if not provider in providersData.keys():
                providersData[provider] = {
                    'counter': 1,
                    'values': [],
                    'pows': [],
                    'errors': 0,
                    'score': [firstRowProv[2]],
                    'scoreNorm': [firstRowProv[4]]
                }
            else:
                providersData[provider]['counter'] += 1
                providersData[provider]['score'].append(firstRowProv[2])
                providersData[provider]['scoreNorm'].append(firstRowProv[4])

            for row in reader:
                value = int(row[0])
                pows = int(row[0])
                if value is -1:
                    providersData[provider]['errors'] += 1
                    tempTestData['errors'] += 1
                    errors += 1
                else:
                    providersData[provider]['values'].append(value)
                    tempTestData['values'].append(value)
                    providersData[provider]['pows'].append(pows)
                    tempTestData['pows'].append(pows)
                    correctValues.append(value+pows)
        csvFile.close()

    singleTestData.append(tempTestData)

errorsPerTestPerc = [
    round(int(x['errors']) / totalRequests, 2) for x in singleTestData
]
providersPerform = [
    {
        'name': x,
        'errorPerc': round(int(providersData[x]['errors']) / (int(providersData[x]
                                                                  ['errors']) + len(providersData[x]['values'])), 2),
        'avgLatency': round(mean(providersData[x]['values']), 2) if len(providersData[x]['values']) > 0 else -1,
        'timesUsed': providersData[x]['counter']
    } for x in providersData.keys()
]
providersNoError = []
for x in providersData.keys():
    if not round(int(providersData[x]['errors']) / (int(providersData[x]['errors']) + len(providersData[x]['values'])), 2):
        providersNoError.append({
            'name': x,
            'avgLatency': round(mean(providersData[x]['values']), 2),
            'timesUsed': providersData[x]['counter']
        })

valuesMean = mean(correctValues)
errorsPerc = errors / (totalRequests * len(singleTestData))

# [print(str(providersData) + str(providersData[x])) for x in providersData]
[print(x) for x in providersNoError]
print(valuesMean)
print(errorsPerc)
#[print(x['name'] + ' ' + str(len(x['values']) + x['errors'])) for x in singleTestData]
