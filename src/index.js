const puppeteer = require('puppeteer-extra')
const fs = require('fs')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker')
// const { resourceLimits } = require('worker_threads')
const readline = require('readline')
const events = require('events')
const fighterObj = require('./fighterObj')

puppeteer.use(StealthPlugin())
puppeteer.use(AdblockerPlugin({ blockTrackers: true }))

puppeteer
  .launch({ userDataDir: './tmp/myChromeSession', headless: true })
  .then(async (browser) => {
    let page = await browser.newPage()
    await page.setViewport({ width: 800, height: 600 })
    let fightersArr = []

    if (!fs.existsSync('./fighter-list.txt')) {
      console.log(
        'fighter-list.txt does not exist. Scraping wiki for list of fighters'
      )
      await page.goto('https://www.ufc.com/rankings')
      await page.waitForTimeout(1000)
      // await page.screenshot({ path: 'adblocker.png', fullPage: true })
      const result = await page.evaluate(() => {
        const nodes = document.querySelectorAll('.views-row')
        const fighters = [[...nodes].map((fighter) => fighter.innerText)]
        return fighters
      })
      let logger = fs.createWriteStream('./fighter-list.txt', { flags: 'a' })

      result[0].forEach((x, i) => {
        if (i === result[0].length - 1) {
          logger.write(x.toLowerCase())
        } else {
          logger.write(x.toLowerCase() + '\n')
        }
        if (!fightersArr.includes(x.toLowerCase())) {
          fightersArr.push(x.toLowerCase())
        }
      })
      logger.end()
      logger.close()
    } else {
      console.log('populating fighterArr from fighter-list.txt')

      let p = async () => {
        let arr = []
        const rl = readline.createInterface({
          input: fs.createReadStream('./fighter-list.txt'),
          crlfDelay: Infinity,
        })

        rl.on('line', (line) => {
          if (line !== '') {
            let modifiedLine = line

              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
            let nameArr = modifiedLine.split(' ')
            let name = ''
            for (let i = 0; i < nameArr.length; i++) {
              if (nameArr[i].match(/^[A-Z]{2}$/g)) {
                name += `${nameArr[i][0]}.${nameArr[i][1]}. `
              } else {
                name += `${nameArr[i]} `
              }
            }
            name = name.trim().toLowerCase()
            if (!arr.includes(name)) {
              arr.push(name)
            }
          }
        })

        await events.once(rl, 'close')

        return arr
      }

      fightersArr = await p()
    }
    console.log(fightersArr)
    let fighterJSON = []
    // await page.close()
    // page = await browser.newPage()
    await page.setViewport({ width: 800, height: 600 })

    for (let i = 0; i < fightersArr.length; i++) {
      console.log(`working on ${fightersArr[i]}`)
      await page.goto('https://www.sherdog.com/stats/fightfinder', {
        setTimeout: 0,
      })
      await page.click('#SearchTxt')
      await page.keyboard.type(fightersArr[i]) // change back to fightersArr
      await page.keyboard.press('Enter')
      await page.waitForTimeout(2000)
      await page.mouse.wheel({ deltaY: 300 })
      await page.waitForTimeout(2000)
      // await page.hover('.lazy')

      // pagination:: search for the correct fighter
      let fighterNameMatch = fightersArr[i] // fightersArr[i]

      let fighterPageLink = { flag: false }

      while (fighterPageLink.flag === false) {
        let emptyResult = await page.$('div.search a')
        if (emptyResult !== null) {
          fighterPageLink = await page.$$eval(
            'div.search a',
            (a, fighterNameMatch) => {
              let arr = a.map((item) => {
                return {
                  name: item.textContent.toLowerCase(),
                  href: item.href,
                }
              })

              for (let j = 0; j < arr.length; ++j) {
                let reverseNameArr = arr[j].name.split(' ').reverse()
                let reversedName = ''
                for (let k = 0; k < reverseNameArr.length; k++) {
                  if (k !== reverseNameArr.length - 1) {
                    reversedName += reverseNameArr[k] + ' '
                  } else {
                    reversedName += reverseNameArr[k]
                  }
                }
                if (
                  arr[j].name.toLowerCase() === fighterNameMatch ||
                  reversedName.toLowerCase() === fighterNameMatch
                ) {
                  return {
                    flag: true,
                    pagination: null,
                    href: arr[j].href,
                    fighterNameMatch,
                    skip: false,
                  }
                }
              }

              let pagination = arr.find((item) => {
                if (item.name === 'next »') {
                  return item.href
                }
              })
              if (pagination !== null || pagination !== undefined) {
                pagination = pagination.href
              }

              return {
                flag: false,
                pagination: pagination,
                href: null,
                fighterNameMatch,
                skip: false,
              }
            },
            fighterNameMatch
          )
          console.log(fighterPageLink)
        } else {
          fighterPageLink.skip = true
          break
          console.log(fighterPageLink)
        }
        console.log(fighterPageLink)

        if (fighterPageLink.pagination !== null) {
          await page.goto(fighterPageLink.pagination, { setTimeout: 0 })
        }
      }

      if (!fighterPageLink.skip) {
        await page.goto(fighterPageLink.href, { setTimeout: 0 })
        fighterJSON.push(
          await page.evaluate(() => {
            let nickName = document.querySelector('.nickname')

            nickName =
              nickName === null ? '' : nickName.innerText.replaceAll('"', '')
            let fighterInfo = document.querySelector('.bio-holder').innerText
            let image = document.querySelector('.profile-image').src
            let age = fighterInfo.match(/(?<=AGE).*/g)[0].trim()
            let height = fighterInfo.match(/(?<=HEIGHT).*/g)[0].trim()
            let weight = fighterInfo.match(/(?<=WEIGHT).*/g)[0].trim()
            let association = document.querySelector(
              'span[itemprop="memberOf"]'
            ).innerText

            let weightClassArr = [
              ...document
                .querySelector('.association-class')
                .querySelectorAll('a'),
            ]
            let weightClass = weightClassArr.pop().innerText
            let totalWin = document.querySelector(
              '.win span:nth-child(2)'
            ).innerText
            let totalLoss = document.querySelector(
              '.lose span:nth-child(2)'
            ).innerText

            let winsCol = document
              .querySelector('.wins')
              .querySelectorAll('.meter')
            let winKO = winsCol[0].querySelector('.pl').innerText
            let winSub = winsCol[1].querySelector('.pl').innerText
            let winDec = winsCol[2].querySelector('.pl').innerText

            let lossCol = document
              .querySelector('.loses')
              .querySelectorAll('.meter')
            let lossKO = lossCol[0].querySelector('.pl').innerText
            let lossSub = lossCol[1].querySelector('.pl').innerText
            let lossDec = lossCol[2].querySelector('.pl').innerText
            let fullName = document.querySelector('.fn').innerText.toLowerCase()
            let history = []
            let historySection = document
              .querySelector('.fight_history')
              .querySelectorAll(`tr:not(:first-child)`)
            historySection.forEach((info) => {
              let tdArr = info.querySelectorAll('td')
              let eventName = tdArr[2].innerText.split('\n')[0]
              let eventDate = tdArr[2].innerText.split('\n')[1]
              history.push({
                result: tdArr[0].innerText,
                opponent: tdArr[1].innerText,
                event: eventName,
                date: eventDate,
                decision: tdArr[3].querySelector('b:first-child').innerText,
                round: tdArr[4].innerText,
                time: tdArr[5].innerText,
              })
            })

            return {
              name: fullName,
              image: image,
              nickName,
              age,
              wins: {
                totalWin,
                winByKOs: winKO,
                winBySubmissions: winSub,
                winByDecisions: winDec,
              },
              loses: {
                totalLoss,
                loseByKOs: lossKO,
                lossBySubmissions: lossSub,
                loseByDecisions: lossDec,
              },
              height,
              weight,
              weightClass,
              association,
              history,
            }
          })
        )
      }
    }
    // console.log(fighterJSON)
    const JSONStringafied = JSON.stringify(fighterJSON)

    let logger = fs.createWriteStream('./fighterJSON.json')
    logger.write(JSONStringafied)

    const fighterInfo = await browser.close()
  })
