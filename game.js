const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const TILE = 32;
const VIEW_W = 30;
const VIEW_H = 20;
const TICK = 600;

let world = {};
let enemies = [];

const XP_TABLE = lvl => Math.floor(50 * Math.pow(lvl, 1.5));

const player = {
  x: 10,
  y: 10,
  zone: "overworld",
  hp: 20,
  maxHp: 20,
  gold: 0,
  skills: {
    attack: { level: 1, xp: 0 },
    defense: { level: 1, xp: 0 },
    woodcutting: { level: 1, xp: 0 }
  },
  inventory: [],
  equipment: { weapon: null, armor: null },
  bank: [],
  activeQuest: null
};

const AudioSystem = {
  ctx: new (window.AudioContext || window.webkitAudioContext)(),
  beep(freq) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.frequency.value = freq;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.2);
    osc.stop(this.ctx.currentTime + 0.2);
  }
};

function createZone(name) {
  const map = [];
  for (let y = 0; y < 100; y++) {
    map[y] = [];
    for (let x = 0; x < 100; x++) {
      let tile = "grass";
      if (Math.random() < 0.08) tile = "tree";
      if (Math.random() < 0.05) tile = "rock";
      map[y][x] = tile;
    }
  }
  world[name] = map;
}

createZone("overworld");
createZone("forest");

function drawTile(type, x, y) {
  const px = x * TILE;
  const py = y * TILE;

  switch (type) {
    case "grass": ctx.fillStyle = "#4b5c3d"; break;
    case "tree": ctx.fillStyle = "#2f4f2f"; break;
    case "rock": ctx.fillStyle = "#777"; break;
  }

  ctx.fillRect(px, py, TILE, TILE);
}

function drawWorld() {
  const map = world[player.zone];
  const camX = player.x - VIEW_W / 2;
  const camY = player.y - VIEW_H / 2;

  for (let y = 0; y < VIEW_H; y++) {
    for (let x = 0; x < VIEW_W; x++) {
      const wx = Math.floor(camX + x);
      const wy = Math.floor(camY + y);
      if (map[wy] && map[wy][wx])
        drawTile(map[wy][wx], x, y);
    }
  }

  ctx.fillStyle = "yellow";
  ctx.fillRect((VIEW_W/2)*TILE, (VIEW_H/2)*TILE, TILE, TILE);
}

function gainXP(skill, amount) {
  const s = player.skills[skill];
  s.xp += amount;
  if (s.xp >= XP_TABLE(s.level)) {
    s.xp = 0;
    s.level++;
    AudioSystem.beep(600);
  }
}

function spawnEnemy() {
  enemies.push({
    x: Math.floor(Math.random()*100),
    y: Math.floor(Math.random()*100),
    hp: 10
  });
}

for (let i=0;i<20;i++) spawnEnemy();

function combatTick(enemy) {
  enemy.hp -= player.skills.attack.level;
  player.hp -= 1;
  if (enemy.hp <= 0) {
    player.gold += 5;
    gainXP("attack", 20);
    AudioSystem.beep(300);
  }
  if (player.hp <= 0) {
    player.hp = player.maxHp;
    player.x = 10;
    player.y = 10;
  }
}

setInterval(() => {
  enemies.forEach(e => {
    if (Math.abs(e.x-player.x)<2 && Math.abs(e.y-player.y)<2)
      combatTick(e);
  });
}, TICK);

window.addEventListener("keydown", e => {
  if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key))
    e.preventDefault();
});

document.addEventListener("keydown", e => {
  if (e.key==="ArrowUp") player.y--; 
  if (e.key==="ArrowDown") player.y++;
  if (e.key==="ArrowLeft") player.x--;
  if (e.key==="ArrowRight") player.x++;
});

const UI = {
  setTab(tab) {
    const p = document.getElementById("panel");
    if (tab==="stats") {
      p.innerHTML = `
      HP: ${player.hp}/${player.maxHp}<br>
      Gold: ${player.gold}<br>
      Attack: ${player.skills.attack.level}<br>
      Defense: ${player.skills.defense.level}<br>
      Woodcutting: ${player.skills.woodcutting.level}
      `;
    }
    if (tab==="inventory") {
      p.innerHTML = player.inventory.map(i=>`<div class="item">${i}</div>`).join("");
    }
    if (tab==="equipment") {
      p.innerHTML = `
      Weapon: ${player.equipment.weapon||"None"}<br>
      Armor: ${player.equipment.armor||"None"}
      `;
    }
    if (tab==="bank") {
      p.innerHTML = player.bank.map(i=>`<div class="item">${i}</div>`).join("");
    }
    if (tab==="quests") {
      p.innerHTML = player.activeQuest ? player.activeQuest : "No Active Quest";
    }
  }
};

function saveGame() {
  localStorage.setItem("mudscape_full", JSON.stringify({player, world}));
}

function loadGame() {
  const data = localStorage.getItem("mudscape_full");
  if (data) {
    const parsed = JSON.parse(data);
    Object.assign(player, parsed.player);
    world = parsed.world;
  }
}

loadGame();
setInterval(saveGame, 5000);

function loop() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawWorld();
  requestAnimationFrame(loop);
}

loop();
UI.setTab("stats");
