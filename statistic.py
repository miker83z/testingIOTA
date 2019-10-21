import os
import csv
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.dates import date2num
import dateutil


def check(x):
    [print(x['name'] + ' ' + str(len(x['tipsValue']) + x['errors']))
     for x in singleTestData[x]]


startingDir = ['dataset/keep/mam/random/data',
               'dataset/keep-NOT/mam/random/data',
               'dataset/keep-NOT/mam/random-NOT/data']
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
fig, axes = plt.subplots(nrows=2, ncols=3, sharey=True,
                         sharex=True, constrained_layout=True, gridspec_kw=gs_kw)
plt.ylim([0, 70000])
fig.suptitle('Tips(orange) and POW(blue) avg latency', fontsize=16)

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

    errorsData.append([[], [], [], [], [], []])
    tipsData.append([[], [], [], [], [], []])
    tipsDataSTD.append([[], [], [], [], [], []])
    powsData.append([[], [], [], [], [], []])
    powsDataSTD.append([[], [], [], [], [], []])
    tmp = 0
    for x in singleTestData[i]:
        errorsData[i][tmp % 6].append(
            round(int(x['errors']) / totalRequests, 4))
        tipsData[i][tmp % 6].append(round(np.mean(x['tipsValue']), 4))
        tipsDataSTD[i][tmp % 6].append(round(np.std(x['tipsValue']), 4))
        powsData[i][tmp % 6].append(round(np.mean(x['powValue']), 4))
        powsDataSTD[i][tmp % 6].append(round(np.std(x['powValue']), 4))
        tmp += 1

    width = 0.12
    width2 = 0.04
    spc = 0.015
    sxrange = np.arange(round(len(singleTestData[i])/6))

    inc = i + 1 if i < 1 else i + 2
    titl1 = 'Algorithm ' + str(inc)
    ylab1 = 'Latency (ms)' if i == 0 else ''
    axes[0][i].set(ylabel=ylab1, title=titl1)
    axes[0][i].bar(sxrange, tipsData[i][0], width, color='tab:orange',
                   align='center')
    axes[0][i].bar(sxrange+spc + width, tipsData[i][1],
                   width, color='tab:orange', align='center')
    axes[0][i].bar(sxrange+spc*2 + width*2, tipsData[i][2],
                   width, color='tab:orange', align='center')
    axes[0][i].bar(sxrange+spc*3 + width*3, tipsData[i][3],
                   width, color='tab:orange', align='center')
    axes[0][i].bar(sxrange+spc*4 + width*4, tipsData[i][4],
                   width, color='tab:orange', align='center')
    axes[0][i].bar(sxrange+spc*5 + width*5, tipsData[i][5],
                   width, color='tab:orange', align='center')

    axes[0][i].bar(sxrange, powsData[i][0], width,
                   bottom=tipsData[i][0], color='tab:blue', align='center')
    axes[0][i].bar(sxrange+spc + width, powsData[i][1], width,
                   bottom=tipsData[i][1], color='tab:blue', align='center')
    axes[0][i].bar(sxrange+spc*2 + width*2, powsData[i][2], width,
                   bottom=tipsData[i][2], color='tab:blue', align='center')
    axes[0][i].bar(sxrange+spc*3 + width*3, powsData[i][3], width,
                   bottom=tipsData[i][3], color='tab:blue', align='center')
    axes[0][i].bar(sxrange+spc*4 + width*4, powsData[i][4], width,
                   bottom=tipsData[i][4], color='tab:blue', align='center')
    axes[0][i].bar(sxrange+spc*5 + width*5, powsData[i][5], width,
                   bottom=tipsData[i][5], color='tab:blue', align='center')

    ax2 = axes[0][i].twinx()
    ylab2 = 'Errors % (red)' if i == 2 else ''
    ax2.set(ylabel=ylab2)

    ax2.bar(sxrange, errorsData[i][0], width2, color='tab:red', align='center')
    ax2.bar(sxrange+spc + width, errorsData[i][1],
            width2, color='tab:red', align='center')
    ax2.bar(sxrange+spc*2 + width*2,
            errorsData[i][2], width2, color='tab:red', align='center')
    ax2.bar(sxrange+spc*3 + width*3,
            errorsData[i][3], width2, color='tab:red', align='center')
    ax2.bar(sxrange+spc*4 + width*4,
            errorsData[i][4], width2, color='tab:red', align='center')
    ax2.bar(sxrange+spc*5 + width*5,
            errorsData[i][5], width2, color='tab:red', align='center')

    ax2.set_ylim([0, 0.5])

    axes[1][i].bar(sxrange, tipsDataSTD[i][0], (width/2), color='tab:orange',
                   align='center')
    axes[1][i].bar(sxrange+spc + width, tipsDataSTD[i][1],
                   (width/2), color='tab:orange', align='center')
    axes[1][i].bar(sxrange+spc*2 + width*2, tipsDataSTD[i][2],
                   (width/2), color='tab:orange', align='center')
    axes[1][i].bar(sxrange+spc*3 + width*3, tipsDataSTD[i][3],
                   (width/2), color='tab:orange', align='center')
    axes[1][i].bar(sxrange+spc*4 + width*4, tipsDataSTD[i][4],
                   (width/2), color='tab:orange', align='center')
    axes[1][i].bar(sxrange+spc*5 + width*5, tipsDataSTD[i][5],
                   (width/2), color='tab:orange', align='center')

    axes[1][i].bar(sxrange + (width/2), powsDataSTD[i][0], (width/2), color='tab:blue',
                   align='center')
    axes[1][i].bar(sxrange+spc + width + (width/2), powsDataSTD[i][1],
                   (width/2), color='tab:blue', align='center')
    axes[1][i].bar(sxrange+spc*2 + width*2 + (width/2), powsDataSTD[i][2],
                   (width/2), color='tab:blue', align='center')
    axes[1][i].bar(sxrange+spc*3 + width*3 + (width/2), powsDataSTD[i][3],
                   (width/2), color='tab:blue', align='center')
    axes[1][i].bar(sxrange+spc*4 + width*4 + (width/2), powsDataSTD[i][4],
                   (width/2), color='tab:blue', align='center')
    axes[1][i].bar(sxrange+spc*5 + width*5 + (width/2), powsDataSTD[i][5],
                   (width/2), color='tab:blue', align='center')

    ylab3 = 'Latency (ms)' if i == 0 else ''
    axes[1][i].set(xlabel='Test ID', ylabel=ylab3,
                   title='Latency STD - Algorithm ' + str(inc))

    print('Test ' + str(i) + ': Avg= ' + str(round(np.mean(allLatencies[i]), 4)) + ', Err%= ' + str(
        round((allErrors[i] / (totalRequests * len(singleTestData[i]))), 4)))

plt.show()
