var timer = 0
var timerInterval

const startTimer = () => {
    timerInterval = setInterval(() => {
        timer++
    }, 1000)
}

const stopTimer = () => {
    clearInterval(timerInterval)
}

const getTimer = () => {
    return timer
}