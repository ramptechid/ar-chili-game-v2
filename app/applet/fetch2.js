const getHTML = async () => {
  const r = await fetch('https://raw.githubusercontent.com/ramptechid/ar-chili-game-spawn/main/index.html');
  const t = await r.text();
  console.log(t);
}
getHTML();
