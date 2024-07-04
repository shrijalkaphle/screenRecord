var mediaRecorder = null;
var chunks = [];
chrome.runtime.onMessage.addListener((message) => {
  if (message.name == 'startRecording') {
    startRecording(message.body.currentTab.id)
  }
  if (message.name == 'stopRecording') {
    mediaRecorder.stop()
  }
});

function startRecording(currentTabId) {
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
          }
        };

        mediaRecorder.onstop = async function (e) {
          const blobFile = new Blob(chunks, { type: "video/webm" });
          // const url = URL.createObjectURL(blobFile);

          const tab = await chrome.tabs.get(currentTabId);
          const websiteURL = tab.url.replace("https://", "").replace("http://", "").split("/")[0];
          const session_name = `1u7k_yppeZEC41W504XRNrlsEHcqD91WMbRmUZJdMDGc_${websiteURL}_${new Date(Date.now()).toISOString()}`;
          const fileName = `${session_name}.webm`;
          const fileURL = await uploadFileToS3(blobFile,fileName);
          await addDataToGoogleSheets(websiteURL, fileURL);
          // Stop all tracks of stream
          stream.getTracks().forEach(track => track.stop());

          // Use chrome.downloads.download to download the file
          // chrome.downloads.download({
          //   url: url,
          //   filename: 'demo.webm', // Ensure the file extension is .webm
          //   saveAs: true // This will prompt the user with a normal save dialog
          // }, function (downloadId) {
          //   console.log('Download started with ID: ', downloadId);
          // });

          window.close();
        };

        mediaRecorder.start();
      }).finally(async () => {
        // After all setup, focus on previous tab (where the recording was requested)
        await chrome.tabs.update(currentTabId, { active: true, selected: true })
      });
    })
}


async function addDataToGoogleSheets(currentURL, fileURL) {

  
  downloadTextFile(JSON.stringify({fileURL, currentURL}))


  const sheetURL = "https://docs.google.com/spreadsheets/d/1jyTM_GMmWx72Xd2ikXpzisu7TH6yvUqMgMmsm3aI2q8/edit?usp=sharing"

  const url = `https://script.google.com/macros/s/AKfycbx5-TjA5BKW7wwPOzZKgxs6wC9uaeqLwle9B4IUjIg8ZS8YZgXzf7NcIE5R72iceBr8eQ/exec?sheetUrl=${sheetURL}&screenshot=${fileURL}&url=${currentURL}&fullHtml=fullllll HTML&parsedHtml=this is parsed&puppeteerCode=var, const, hehe&actions=tei ta ho ne, hoina ra ?`

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
    if(!response.ok) downloadTextFile(await response.text())
    downloadTextFile(JSON.stringify(response.json()))
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

  if(!response.ok) {
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
  if(!uploadResponse.ok) downloadTextFile(await response.text())

  return fileURL || `https://deploysentinel-uploads.s3.amazonaws.com/${fileName}`
}