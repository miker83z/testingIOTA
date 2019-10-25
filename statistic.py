import scipy.stats
import os
import csv
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
import math


def check(y):
    for x in singleTestData[y]:
        if len(x['tipsValue']) + x['errors'] != 447:
            print(x['name'] + ' ' + str(len(x['tipsValue']) + x['errors']))


def mean_confidence_interval(data, confidence=0.95):
    a = 1.0 * np.array(data)
    n = len(a)
    m, se = np.mean(a), scipy.stats.sem(a)
    h = se * scipy.stats.t.ppf((1 + confidence) / 2., n-1)
    return m, m-h, m+h


def ecdf(data):
    x = np.sort(data)
    n = x.size
    y = np.arange(1, n+1) / n
    return(x,y)


startingDir = ['dataset/keep/mam/random/data',
               'dataset/keep/mam/random/data-12',
               'dataset/keep/mam/random/data-12',
               'dataset/keep-NOT/mam/random/data',
               'dataset/keep-NOT/mam/random/data-12',
               'dataset/keep-NOT/mam/random/data-12',
               'dataset/keep-NOT/mam/random-NOT/data',
               'dataset/keep-NOT/mam/random-NOT/data-12',
               'dataset/keep-NOT/mam/random-NOT/data-12']
plotTestNumber = 12
totalRequests = 447

singleTestData = []
allLatencies = []
allErrors = []
errorsData = []
tipsData = []
tipsDataSTD = []
powsData = []
powsDataSTD = []

for i in range(len(startingDir)):
    singleTestData.append([])
    allLatencies.append([])
    allErrors.append(0)

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
    groupDim = round(len(singleTestData[i]) / plotTestNumber)
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

    print('Test ' + str(i) + ': Avg= ' + str(round(np.mean(allLatencies[i]), 4)) + ', Err%= ' + str(
        round((allErrors[i] / (totalRequests * len(singleTestData[i]))), 4)))


def plot1(ids):
    widths = [2, 2, 2]
    heights = [3, 1]
    gs_kw = dict(width_ratios=widths, height_ratios=heights)
    fig, axes = plt.subplots(nrows=2, ncols=3, sharex=True,
                             constrained_layout=True, gridspec_kw=gs_kw)
    # plt.ylim([0, 70000])
    # plt.yscale('log')
    #fig.suptitle('Transaction Insertion to IOTA: average latencies and errors', fontsize=16)
    red_patch = mpatches.Patch(color='tab:red', label='Errors')
    orange_patch = mpatches.Patch(color='tab:orange', label='Tips')
    blue_patch = mpatches.Patch(color='tab:blue', label='PoWs')

    for i in range(len(ids)):
        width = .7
        width2 = 0.2
        sxrange = np.arange(plotTestNumber)

        # First Row
        if i == 0:
            titl1 = 'Fixed Random'
        elif i == 1:
            titl1 = 'Dynamic Random'
        elif i == 2:
            titl1 = 'Adaptive RTT'
        ylab1 = 'Tips Selection and PoW Latency (ms)' if i == 0 else ''
        axes[0][i].set_ylabel(ylab1, fontsize=13)
        axes[0][i].set_title(titl1, fontdict = { 'fontsize' : 16} , weight='heavy')
        axes[0][i].bar(sxrange, tipsData[ids[i]], width, color='tab:orange',
                       align='center')
        axes[0][i].bar(sxrange, powsData[ids[i]], width,
                       bottom=tipsData[ids[i]], color='tab:blue', align='center')
        if i > 0:
            axes[0][i].set_yticklabels([])
        axes[0][i].set_ylim([0, 120000])

        # First Row Errors
        ax2 = axes[0][i].twinx()
        ylab2 = 'Errors (%)' if i == 2 else ''
        ax2.set_ylabel(ylab2, fontsize=13)
        ax2.bar(sxrange, errorsData[ids[i]], width2,
                color='tab:red', align='center')
        if i < len(ids) - 1:
            ax2.set_yticklabels([])
        else:
            ax2.legend(handles=[red_patch, orange_patch,
                                blue_patch], fontsize='x-large')
        ax2.set_ylim([0, 0.5])

        # Second Row
        axes[1][i].bar(sxrange - (width/4), tipsDataSTD[ids[i]], (width/2), color='tab:orange',
                       align='center')
        axes[1][i].bar(sxrange + (width/4), powsDataSTD[ids[i]], (width/2), color='tab:blue',
                       align='center')
        ylab3 = 'Latency STD (ms)' if i == 0 else ''
        axes[1][i].set_xlabel('Test ID') 
        axes[1][i].set_ylabel(ylab3, fontsize=13)
        if i > 0:
            axes[1][i].set_yticklabels([])
        axes[1][i].set_ylim([0, 170000])


def plot2(ids):
    colors = ['tab:green', 'tab:red', 'tab:cyan']
    green_patch = mpatches.Patch(color='tab:green', label='Fixed Random')
    red_patch = mpatches.Patch(color='tab:red', label='Dynamic Random')
    cyan_patch = mpatches.Patch(color='tab:cyan', label='Adaptive RTT')
    plt.subplots(nrows=1, ncols=1, constrained_layout=True)
    plt.xscale('log')
    plt.ylabel("ECDF", fontsize=13)
    plt.xlabel("latency (sec)", fontsize=13)
    plt.legend(handles=[green_patch, red_patch, cyan_patch], fontsize='large')

    for i in range(len(ids)):
        x,y = ecdf(np.array(allLatencies[ids[i]])/1000)
        plt.scatter(x, y,color=colors[i%3], s=4)
        plt.xlim([0.5,6500])
        
        #plt.hist(np.array(allLatencies[ids[i]])/1000, 10000, density=True, histtype='step', cumulative=True)


def plot3():
    _, ax = plt.subplots()
    plt.yscale('log')
    allLatenciesTemp = []
    avg = []
    for x in allLatencies:
        tmp = np.array(x)/1000
        allLatenciesTemp.append(tmp)
        avg.append(np.mean(tmp))
    
    positions = [1,1.6,2.2,3.2,3.8,4.4,5.4,6,6.6]
    bp = ax.boxplot(allLatenciesTemp, positions= positions, sym='+', patch_artist=True)
    ax.set_xticklabels(['60 bus','120 bus\n\nFixed Random','240 bus','60 bus','120 bus\n\nDynamic Random','240 bus','60 bus','120 bus\n\nAdaptive RTT','240 bus'], fontsize=13)
    ax.set_ylabel("latency (sec)", fontsize=13)

    i = 0
    colors = ['tab:brown', 'tab:green', 'tab:cyan']
    for box in bp['boxes']:
        box.set(facecolor= colors[i%3])
        i += 1
    for m in bp['medians']:
        m.set(color='tab:red')

    ax.scatter(positions, avg, color='w', marker='*', edgecolors='black', s=150, zorder=10)


#plot1([0,3,6])
plot2([2,5,8])
#plot3()

plt.show()
