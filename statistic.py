import os
import csv
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
from matplotlib.dates import date2num
import dateutil


def check(x):
    [print(x['name'] + ' ' + str(len(x['tipsValue']) + x['errors']))
     for x in singleTestData[x]]


startingDir = ['dataset/keep/mam/random/data',
               'dataset/keep-NOT/mam/random-NOT/data-12',
               'dataset/keep-NOT/mam/random-NOT/data']
groupDim = 6
totalRequests = 447
singleTestData = [[], [], []]
allLatencies = [[], [], []]
allErrors = [0, 0, 0]
errorsData = []
tipsData = []
tipsDataSTD = []
powsData = []
powsDataSTD = []

widths = [2, 2, 2]
heights = [3, 1]
gs_kw = dict(width_ratios=widths, height_ratios=heights)
fig, axes = plt.subplots(nrows=2, ncols=3, sharex=True,
                         constrained_layout=True, gridspec_kw=gs_kw)
# plt.ylim([0, 70000])
# plt.yscale('log')
fig.suptitle('Messages transmission average latency', fontsize=16)
red_patch = mpatches.Patch(color='tab:red', label='Errors')
orange_patch = mpatches.Patch(color='tab:orange', label='Tips')
blue_patch = mpatches.Patch(color='tab:blue', label='PoWs')

fig2, axes2 = plt.subplots(nrows=1, ncols=3, sharey=True, sharex=True,
                           constrained_layout=True)

for i in range(len(startingDir)):
    path = os.walk(startingDir[i])
    next(path)
    for directory in path:
        tempTestData = {
            'name': directory[0].split('/')[-1],
            'tipsValue': [],
            'powValue': [],
            'errors': 0
        }
        for csvFilename in directory[2]:
            with open(directory[0]+'/'+csvFilename, 'r') as csvFile:
                reader = csv.reader(csvFile)
                next(reader)
                for row in reader:
                    srt = int(row[0])
                    tips = int(row[1])
                    fin = int(row[2])
                    if fin is -1:
                        tempTestData['errors'] += 1
                        allErrors[i] += 1
                    else:
                        tipsValue = tips - srt
                        powValue = fin - tips
                        tempTestData['powValue'].append(powValue)
                        tempTestData['tipsValue'].append(tipsValue)
                        allLatencies[i].append(tipsValue+powValue)
            csvFile.close()

        singleTestData[i].append(tempTestData)

    errorsData.append([])
    tipsData.append([])
    tipsDataSTD.append([])
    powsData.append([])
    powsDataSTD.append([])
    x = 0
    while x < len(singleTestData[i]):
        tmp = [0, [], []]
        for k in range(groupDim):
            tmp[0] += int(singleTestData[i][x+k]['errors'])
            tmp[1].extend(singleTestData[i][x+k]['tipsValue'])
            tmp[2].extend(singleTestData[i][x+k]['powValue'])
        x += groupDim

        errorsData[i].append(
            round(int(tmp[0]) / (totalRequests * groupDim), 4))
        tipsData[i].append(round(np.mean(tmp[1]), 4))
        tipsDataSTD[i].append(round(np.std(tmp[1]), 4))
        powsData[i].append(round(np.mean(tmp[2]), 4))
        powsDataSTD[i].append(round(np.std(tmp[2]), 4))

    width = .7
    width2 = 0.2
    sxrange = np.arange(round(len(singleTestData[i])/groupDim))

    inc = i + 1 if i < 1 else i + 2
    titl1 = 'Algorithm ' + str(inc)
    ylab1 = 'Latency (ms)' if i == 0 else ''
    axes[0][i].set(ylabel=ylab1, title=titl1)
    axes[0][i].bar(sxrange, tipsData[i], width, color='tab:orange',
                   align='center')
    axes[0][i].bar(sxrange, powsData[i], width,
                   bottom=tipsData[i], color='tab:blue', align='center')
    if i > 0:
        axes[0][i].set_yticklabels([])
    axes[0][i].set_ylim([0, 120000])

    ax2 = axes[0][i].twinx()
    ylab2 = 'Errors (%)' if i == 2 else ''
    ax2.set(ylabel=ylab2)
    ax2.bar(sxrange, errorsData[i], width2,
            color='tab:red', align='center')
    if i < len(singleTestData) - 1:
        ax2.set_yticklabels([])
    else:
        ax2.legend(handles=[red_patch, orange_patch,
                            blue_patch], fontsize='x-large')
    ax2.set_ylim([0, 0.5])

    axes[1][i].bar(sxrange - (width/4), tipsDataSTD[i], (width/2), color='tab:orange',
                   align='center')
    axes[1][i].bar(sxrange + (width/4), powsDataSTD[i], (width/2), color='tab:blue',
                   align='center')
    ylab3 = 'Latency (ms)' if i == 0 else ''
    axes[1][i].set(xlabel='Test ID', ylabel=ylab3,
                   title='Latency STD - Algorithm ' + str(inc))
    if i > 0:
        axes[1][i].set_yticklabels([])
    axes[1][i].set_ylim([0, 170000])

    axes2[i].hist(allLatencies[i], bins=50, density=True,
                  histtype='step', cumulative=True)

    print('Test ' + str(i) + ': Avg= ' + str(round(np.mean(allLatencies[i]), 4)) + ', Err%= ' + str(
        round((allErrors[i] / (totalRequests * len(singleTestData[i]))), 4)))

plt.show()

check(1)
