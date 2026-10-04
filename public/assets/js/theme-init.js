// Applies the saved theme before first paint (loaded as a classic, blocking script).
(function () {
    try {
        var theme = localStorage.getItem('dollarbaan.theme');
        if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
    } catch (error) {
        /* storage unavailable: follow the system theme */
    }
})();
