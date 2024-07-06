var mediaRecorder = null;
var chunks = [];
var currentTabId = null;
var puppeteerCode = null
var actions = null
var timer = 0
const sheetURL = "https://docs.google.com/spreadsheets/d/1jyTM_GMmWx72Xd2ikXpzisu7TH6yvUqMgMmsm3aI2q8/edit?usp=sharing"
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
            chunks.push(e.data);
            takeScreenshot(e.data)
          }
        };

        mediaRecorder.onstop = async function (e) {
          clearInterval(screenshotInterval)
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

          // await endRecording(currentTabId, chunks)


          // window.close();
        };

        // mediaRecorder.onstop = endRecording(currentTabId)

        mediaRecorder.start();
        let screenshotInterval = setInterval(takeScreenshot, 5000)
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

  await addDataToGoogleSheets(sheetURL, websiteURL, fileURL, html, parsedHtml, _puppeteerCode, _actions);
}


async function addDataToGoogleSheets(sheetURL, currentURL, fileURL, html, parsedHtml, puppeteerCode, actions) {


  // downloadTextFile(JSON.stringify({ sheetURL, currentURL, fileURL, html, parsedHtml, puppeteerCode, actions }));

  const url = `https://script.google.com/macros/s/AKfycbx5-TjA5BKW7wwPOzZKgxs6wC9uaeqLwle9B4IUjIg8ZS8YZgXzf7NcIE5R72iceBr8eQ/exec?sheetUrl=${sheetURL}&screenshot=${fileURL}$video=${fileURL}&url=${currentURL}&fullHtml=${html}&parsedHtml=${parsedHtml}&puppeteerCode=${puppeteerCode}&actions=${actions}`

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
    if (!response.ok) downloadTextFile(await response.text())
  } catch (error) {
    downloadTextFile(JSON.stringify(error))
  }
}

function downloadTextFile(text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "mydata.txt";
  link.click();
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
    downloadTextFile(await response.text())
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
  if (!uploadResponse.ok) downloadTextFile(await response.text())

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
    downloadTextFile(await response.text())
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
  if (!uploadResponse.ok) downloadTextFile(JSON.stringify({ uploadResponse: await uploadResponse.text(), type: 'html' }))

  // downloadTextFile(JSON.stringify({data, presignedUrl, fileURL, type: 'html'}))
  return fileURL || `https://deploysentinel-uploads.s3.amazonaws.com/${fileName}`

}

async function getParsedHtml(html) {
  return new Promise((resolve) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    resolve(doc.body.innerHTML)
  })
}

function takeScreenshot(chunk) {

  const blob = new Blob([chunks.pop()], { type: "video/webm" });
  const video = document.createElement('video');
  video.src = URL.createObjectURL(blob);

  // const canvas = document.createElement('canvas');
  // canvas.width = video.videoWidth;
  // canvas.height = video.videoHeight;
  // const ctx = canvas.getContext('2d');
  // ctx.drawImage(video, 0, 0);

  // console.log('canvas', canvas.toDataURL('image/png'))

  console.log(chunk, chunks.pop(), URL.createObjectURL(blob))
}