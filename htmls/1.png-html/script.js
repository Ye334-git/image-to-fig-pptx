(() => {
  const shell = document.querySelector(".fit-shell");
  const box = document.querySelector(".fit-box");
  const screen = document.querySelector(".screen");
  if (!shell || !box || !screen) return;
  const fit = () => {
    const availableWidth = shell.getBoundingClientRect().width;
    const scale = Math.min(1, availableWidth / 1747);
    box.style.width = (1747 * scale) + "px";
    box.style.height = (900 * scale) + "px";
    screen.style.setProperty("transform", `scale(${scale})`, "important");
    screen.style.setProperty("transform-origin", "top left", "important");
  };
  new ResizeObserver(fit).observe(shell);
  window.addEventListener("resize", fit);
  fit();
})();