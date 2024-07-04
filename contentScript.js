// Add 'hovered' class on mouse over
document.addEventListener('mouseover', function(event) {
    event.target.classList.add('hovered');
    console.log('we');
});

// Remove 'hovered' class on mouse out
document.addEventListener('mouseout', function(event) {
    event.target.classList.remove('hovered');
});

// Manage 'hovered' class on click to maintain the box until another click
document.addEventListener('click', function(event) {
    document.querySelectorAll('.hovered').forEach(el => el.classList.remove('hovered'));
    event.target.classList.add('hovered');
    
});