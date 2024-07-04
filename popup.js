const startRecording = () => {
  chrome.runtime.sendMessage({ name: 'initiateRecording' });
};

const stopRecording = () => {
  chrome.runtime.sendMessage({ name: 'stopRecording' });
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('startRecordingButton').addEventListener('click', startRecording);
  document.getElementById('stopRecordingButton').addEventListener('click', stopRecording);
});

console.log('www')

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(message.message);
});