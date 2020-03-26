import os
import csv
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.lines as mlines
import numpy as np
import scipy.stats
import math

startingDir = ['datasetIPFS/dataSia',
               'datasetIPFS/dataInfura',
               'datasetIPFS/dataPriv']
totalRequests = 79

singleTestData = []
allLatencies = []
allErrors = []


def confInt(data, confidence=0.95):
    a = 1.0 * np.array(data)
    n = len(a)
    m, se = np.mean(a), scipy.stats.sem(a)
    h = se * scipy.stats.t.ppf((1 + confidence) / 2., n-1)
    return round((m-h)/1000, 2), round((m+h)/1000, 2)


def get_data():
    flag = False
    for i in range(len(startingDir)):
        singleTestData.append([])
        allLatencies.append([])
        allErrors.append(0)

        path = os.walk(startingDir[i])
        next(path)
        for directory in path:
            tempTestData = {
                'name': directory[0].split('/')[-1],
                'value': [],
                'errors': 0
            }
            for csvFilename in directory[2]:
                with open(directory[0]+'/'+csvFilename, 'r') as csvFile:
                    reader = csv.reader(csvFile)
                    next(reader)
                    for row in reader:
                        if not flag:
                            value = int(row[4])
                            tempTestData['value'].append(value)
                            allLatencies[i].append(value)
                        else:
                            srt = int(row[0])
                            fin = int(row[1])
                            if fin == -1:
                                tempTestData['errors'] += 1
                                allErrors[i] += 1
                            else:
                                value = fin - srt
                                tempTestData['value'].append(value)
                                allLatencies[i].append(value)
                csvFile.close()

            if len(tempTestData['value']) + tempTestData['errors'] != totalRequests:
                print('Check: ' + tempTestData['name'] + ' ' + str(
                    len(tempTestData['value']) + tempTestData['errors']))
                errorsNotWritten = totalRequests - \
                    len(tempTestData['value']) - tempTestData['errors']
                tempTestData['errors'] += errorsNotWritten
                allErrors[i] += errorsNotWritten

            singleTestData[i].append(tempTestData)

        print('Test ' + str(i) + ': Avg= ' + str(round(np.mean(allLatencies[i])/1000, 2)) + ', Err%= ' + str(
            round((allErrors[i] / (totalRequests * len(singleTestData[i])))*100, 2)) + ', ConfInt= ' + str(confInt(allLatencies[i])))
        flag = True
    allLatencies[0], allLatencies[2] = allLatencies[2], allLatencies[0]


def plot():
    fig, ax = plt.subplots(constrained_layout=True)
    fig.set_size_inches(7, 7)
    # plt.yscale('log')
    plt.ylim([0, 18])
    allLatenciesTemp = []
    avg = []
    err = []
    for x in allLatencies:
        tmp = np.array(x) / 1000
        allLatenciesTemp.append(tmp)
        avg.append(np.mean(tmp))
    for i in range(len(allErrors)):
        err.append(allErrors[i] / (totalRequests * len(singleTestData[i])))

    positions = [.5, 1, 1.5]
    bp = ax.boxplot(allLatenciesTemp, positions=positions,
                    sym='x', patch_artist=True)
    ax.set_xticklabels(
        ['IPFS Private', 'IPFS Public\n(Infura)', 'Sia\n(Skynet)'], fontsize=13)
    ax.set_ylabel("latency (sec)", fontsize=13)

    i = 0
    colors = ['tab:blue', 'tab:orange', 'tab:green']
    for box in bp['boxes']:
        box.set(facecolor=colors[i % 3])
        i += 1
    for m in bp['medians']:
        m.set(color='tab:red')

    #ax.scatter(positions, avg, color='w', marker='D', edgecolors='black', s=75, zorder=10)
    #ax.plot(positions[0:3], avg[0:3], color='tab:red', zorder=9)
    #ax.plot(positions[3:6], avg[3:6], color='tab:red', zorder=9)
    #ax.plot(positions[6:9], avg[6:9], color='tab:red', zorder=9)

    # ax2 = ax.twinx()
    # ylab2 = 'Errors (%)'
    # ax2.set_ylabel(ylab2, fontsize=13)
    # ax2.plot(positions[0:3], err[0:3], color='gold', marker='*', markeredgecolor='black', markersize=15, zorder=10)
    # ax2.plot(positions[3:6], err[3:6], color='gold', marker='*', markeredgecolor='black', markersize=15, zorder=10)
    # ax2.plot(positions[6:9], err[6:9], color='gold', marker='*', markeredgecolor='black', markersize=15, zorder=10)
    # ax2.set_ylim([0, 0.5])

    # star = mlines.Line2D([], [], color='gold', marker='*', linestyle='None', markeredgecolor='black',
    #                      markersize=15, label='Errors')
    # diamond = mlines.Line2D([], [], color='w', marker='D', linestyle='None', markeredgecolor='black',
    #                        markersize=10, label='Averages')
    # patch1 = mpatches.Patch(color=colors[0], label='60 buses')
    # patch2 = mpatches.Patch(color=colors[1], label='120 buses')
    # patch3 = mpatches.Patch(color=colors[2], label='240 buses')

    # ax.legend(handles=[patch1, patch2, patch3], fontsize='x-large')


get_data()
plot()

plt.show()
