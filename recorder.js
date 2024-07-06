var mediaRecorder = null;
var chunks = [];
var currentTabId = null;
var puppeteerCode = null
var actions = null
const sheetURL = "https://docs.google.com/spreadsheets/d/1BWHF4pujjsp71zEBnTszRUsMAQeWwe4tPlDtNYRyKEY/edit?usp=sharing"
const sheetId = sheetURL.split("/")[5];


chrome.runtime.onMessage.addListener((message) => {
  if (message.name == 'startRecording') {
    startRecording(message.body.currentTab.id)
  }
  if (message.name == 'stopRecording') {
    // const { puppeteerCode, actions } = message.body
    mediaRecorder.stop()
    // mediaRecorder.stop()
  }
});

function startRecording(_currentTabId) {
  currentTabId = _currentTabId
  // Prompt user to choose screen or window
  chrome.desktopCapture.chooseDesktopMedia(
    ['screen', 'window'],
    function (streamId) {
      if (streamId == null) {
        return;
      }

      // Once user has chosen screen or window, create a stream from it and start recording
      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: streamId,
            minWidth: 1920,
            maxWidth: 1920,
            minHeight: 1080,
            maxHeight: 1080,
            minAspectRatio: 1.77,
            maxAspectRatio: 1.78
          }
        }
      }).then(stream => {
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });

        chunks = [];

        mediaRecorder.ondataavailable = function (e) {
          if (e.data.size > 0) {
            chunks.push(e.data)
          }
        };

        mediaRecorder.onstart = startTimer()

        mediaRecorder.onstop = async function (e) {
          // const blobFile = new Blob(chunks, { type: "video/webm" });
          // const url = URL.createObjectURL(blobFile);

          // Use chrome.downloads.download to download the file
          // chrome.downloads.download({
          //   url: url,
          //   filename: 'demo.webm', // Ensure the file extension is .webm
          //   saveAs: true // This will prompt the user with a normal save dialog
          // }, function (downloadId) {
          //   console.log('Download started with ID: ', downloadId);
          // });
          // Stop all tracks of stream
          stream.getTracks().forEach(track => track.stop());
          await endRecording(currentTabId, chunks)
          // window.close();
        };

        // mediaRecorder.onstop = endRecording(currentTabId)

        mediaRecorder.start();
      }).finally(async () => {
        // After all setup, focus on previous tab (where the recording was requested)
        await chrome.tabs.update(currentTabId, { active: true, selected: true })
      });
    })
}

async function endRecording(currentTabId, chunks) {
  const blobFile = new Blob(chunks, { type: "video/webm" });

  const tab = await chrome.tabs.get(currentTabId);
  const websiteURL = tab.url.replace("https://", "").replace("http://", "").split("/")[0];
  const session_name = `${sheetId}_${websiteURL}_${new Date(Date.now()).toISOString()}`;
  const fileName = `${session_name}.webm`;
  const fileURL = await uploadFileToS3(blobFile, fileName);
  const html = await getHTML(currentTabId, session_name);
  const parsedHtml = 'getParsedHtml';
  const _puppeteerCode = puppeteerCode || 'puppeteerCode';
  const _actions = actions || 'actions';

  // const screenshotURL = `https://deploysentinel-uploads.s3.amazonaws.com/${session_name}`
  // takeScreenshot(session_name)
  const screenshotURL = "sc shot"

  await addDataToGoogleSheets(sheetURL, websiteURL, screenshotURL, fileURL, html, parsedHtml, _puppeteerCode, _actions);
}


async function addDataToGoogleSheets(
  sheetURL, 
  currentURL, 
  screenshotURL, 
  fileURL, 
  html, 
  parsedHtml, 
  puppeteerCode, 
  actions ) {

  const url = `https://script.google.com/macros/s/AKfycbx5-TjA5BKW7wwPOzZKgxs6wC9uaeqLwle9B4IUjIg8ZS8YZgXzf7NcIE5R72iceBr8eQ/exec?sheetUrl=${sheetURL}&screenshot=${screenshotURL}&video=fileURL&url=${currentURL}&fullHtml=${html}&parsedHtml=${parsedHtml}&puppeteerCode=${puppeteerCode}&actions=${actions}`
  console.log(url)

  const data = JSON.stringify({
    sheetURL,
    name: "test1",
    age: 27
  })

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: data
    })
    if (!response.ok) console.log(await response.text())
  } catch (error) {
    console.log(JSON.stringify(error))
  }
}

async function uploadFileToS3(file, fileName) {
  // get presigned url
  const response = await fetch('https://o37o33jkad.execute-api.us-east-1.amazonaws.com/file-upload-link', {
    method: 'POST',
    body: JSON.stringify({
      filename: fileName,
      contentType: "video/webm"
    })
  })

  if (!response.ok) {
    console.log(await response.text())
    return 'error'
  }

  // upload file
  const data = await response.json()
  const presignedUrl = data.uploadUrl
  const fileURL = data.fileURL

  const uploadResponse = await fetch(presignedUrl, {
    method: 'PUT',
    body: file
  })
  if (!uploadResponse.ok) console.log(await response.text())

  return fileURL || `https://deploysentinel-uploads.s3.amazonaws.com/${fileName}`
}

async function getHTML(currentTabId, sessionId) {
  const result = await chrome.scripting.executeScript({
    target: {
      tabId: currentTabId
    },
    function: () => document.documentElement.outerHTML
  })

  const html = result[0].result

  // upload to s3
  const htmlBlob = new Blob([html], { type: "text/html;charset=utf-8" });
  const fileName = `${sessionId}_html.html`;
  // get presigned url
  const response = await fetch('https://o37o33jkad.execute-api.us-east-1.amazonaws.com/file-upload-link', {
    method: 'POST',
    body: JSON.stringify({
      filename: fileName,
      contentType: "text/html"
    })
  })

  if (!response.ok) {
    console.log(await response.text())
    return 'error'
  }

  // upload file
  const data = await response.json()
  const presignedUrl = data.uploadUrl
  const fileURL = data.fileURL

  const uploadResponse = await fetch(presignedUrl, {
    method: 'PUT',
    body: htmlBlob
  })
  if (!uploadResponse.ok) console.log(JSON.stringify({ uploadResponse: await uploadResponse.text(), type: 'html' }))

  return fileURL || `https://deploysentinel-uploads.s3.amazonaws.com/${fileName}`

}

async function getParsedHtml(html) {
  return new Promise((resolve) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    resolve(doc.body.innerHTML)
  })
}

async function takeScreenshot(sessionName) {

  let screenshotData = []
  let captureInterval
  const totalTime = getTimer()
  const blob = new Blob(chunks, { type: "video/webm" });
  const video = document.createElement('video');
  video.src = URL.createObjectURL(blob);
  video.controls = true
  video.height = 540
  video.width = 960
  document.body.appendChild(video);

  const btn = document.createElement('button');
  btn.innerHTML = 'Capture';
  btn.onclick = function () {
    // capture()
    video.currentTime = 5
  }
  document.body.appendChild(btn);

  const capture = async function () {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL();
    document.body.appendChild(canvas);
    screenshotData.push({
      timer: video.currentTime,
      dataURL: data
    });
  }
  video.onseeked = function () {
    capture()
  }
  video.onended = function () {
    clearInterval(captureInterval)
    uploadScreenshots(screenshotData,sessionName)
  }

  captureInterval = setInterval(() => {
    video.currentTime = video.currentTime + 1
  },1000)
  // video.currentTime = 0
}

function renameScreenshots(timer) {
  const seconds = Number(timer)
  const hours = Math.floor(seconds / 3600).toLocaleString('en-US', { minimumIntegerDigits: 2, useGrouping: false })
  const minutes = Math.floor(seconds / 60).toLocaleString('en-US', { minimumIntegerDigits: 2, useGrouping: false })
  const secondsLeft = (seconds % 60).toLocaleString('en-US', { minimumIntegerDigits: 2, useGrouping: false })
  return `${hours}_${minutes}_${secondsLeft}.png`
}

async function uploadScreenshots(screenshotData,sessionName) {
  screenshotData.forEach(async (screenshot, index) => {

    // get presigend url
    const fileName = `${sessionName}/${renameScreenshots(screenshot.timer)}`

    const response = await fetch('https://o37o33jkad.execute-api.us-east-1.amazonaws.com/file-upload-link', {
      method: 'POST',
      body: JSON.stringify({
        filename: fileName,
        contentType: "image/png"
      })
    })
    if (!response.ok) {
      console.log(await response.text())
      return 'error'
    }

    // upload file
    const base64 = screenshot.dataURL.split(",")[1];
    const decoded = atob(base64);
    const arrayBuffer = new Uint8Array(decoded.length);
    const uint8Array = new Uint8Array(arrayBuffer);

    for (let i = 0; i < decoded.length; i++) {
      uint8Array[i] = decoded.charCodeAt(i);
    }
    const blob = new Blob([uint8Array], { type: "image/png" });
    const data = await response.json()
    const presignedUrl = data.uploadUrl
    console.log(URL.createObjectURL(blob))

    const uploadResponse = await fetch(presignedUrl, {
      method: 'PUT',
      body: blob
    })
    if (!uploadResponse.ok) console.log(JSON.stringify({ uploadResponse: await uploadResponse.text(), type: 'screenshot' }))

  })
}