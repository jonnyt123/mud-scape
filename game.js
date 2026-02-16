/* Mud Scape 3D - lightweight Three.js RPG foundation */
(() => {
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x202020);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 800);
  scene.add(camera);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(12, 18, 8);
  sun.castShadow = true;
  scene.add(sun);

  // UI
  const el = id => document.getElementById(id);
  const hud = {
    hp: el('hp'),
    maxHp: el('maxHp'),
    gold: el('gold'),
    atkLvl: el('atkLvl'),
    atkXp: el('atkXp'),
    atkNext: el('atkNext'),
    defLvl: el('defLvl'),
    defXp: el('defXp'),
    defNext: el('defNext'),
    log: el('log'),
  };

  const log = msg => {
    const div = document.createElement('div');
    div.className = 'line';
    div.textContent = msg;
    hud.log.prepend(div);
    while (hud.log.childElementCount > 12) hud.log.lastElementChild.remove();
  };

  // RNG (deterministic for consistent world)
  function createRng(seed = 1337) {
    let s = seed >>> 0;
    return () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return (s >>> 0) / 0xFFFFFFFF;
    };
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const XP = lvl => Math.floor(60 * Math.pow(lvl, 1.6));

  const state = {
    player: {
      pos: new THREE.Vector3(0, 0, 0),
      target: new THREE.Vector3(0, 0, 0),
      hp: 20,
      maxHp: 20,
      gold: 0,
      skills: {
        attack: { level: 1, xp: 0 },
        defense: { level: 1, xp: 0 },
      },
    },
    enemies: [],
    rngSeed: 2024,
  };

  function save() {
    try {
      const s = {
        p: {
          x: state.player.pos.x,
          z: state.player.pos.z,
          hp: state.player.hp,
          maxHp: state.player.maxHp,
          gold: state.player.gold,
          skills: state.player.skills,
        },
        seed: state.rngSeed,
      };
      localStorage.setItem('mudscape3d', JSON.stringify(s));
      log('Game saved');
    } catch {
      log('Save failed (storage unavailable)');
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem('mudscape3d');
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      state.rngSeed = parsed.seed || state.rngSeed;
      state.player.pos.x = parsed.p?.x ?? 0;
      state.player.pos.z = parsed.p?.z ?? 0;
      state.player.target.copy(state.player.pos);
      state.player.hp = parsed.p?.hp ?? 20;
      state.player.maxHp = parsed.p?.maxHp ?? 20;
      state.player.gold = parsed.p?.gold ?? 0;
      state.player.skills = parsed.p?.skills ?? state.player.skills;
      log('Save loaded');
      return true;
    } catch {
      return false;
    }
  }

  // Player model (no copyrighted assets)
  const playerGroup = new THREE.Group();
  playerGroup.castShadow = true;
  playerGroup.receiveShadow = true;
  scene.add(playerGroup);

  function makePlayerModel() {
    playerGroup.clear();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x77aaff, flatShading: true });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffd4a3, flatShading: true });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 1.6, 6), bodyMat);
    body.position.y = 1.1;
    playerGroup.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), skinMat);
    head.position.y = 2.0;
    playerGroup.add(head);

    const shoulder = new THREE.BoxGeometry(0.2, 0.7, 0.2);
    const armL = new THREE.Mesh(shoulder, skinMat);
    const armR = armL.clone();
    armL.position.set(-0.75, 1.0, 0);
    armR.position.set(0.75, 1.0, 0);
    playerGroup.add(armL, armR);

    const legGeo = new THREE.BoxGeometry(0.25, 0.9, 0.25);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x223355, flatShading: true });
    const legL = new THREE.Mesh(legGeo, legMat);
    const legR = legL.clone();
    legL.position.set(-0.25, 0.45, 0);
    legR.position.set(0.25, 0.45, 0);
    playerGroup.add(legL, legR);

    playerGroup.position.set(0, 0, 0);
  }

  makePlayerModel();

  // Enemies
  function spawnEnemies(rng) {
    state.enemies.length = 0;
    const enemyMat = new THREE.MeshStandardMaterial({ color: 0xff5555, flatShading: true });

    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), enemyMat);
      b.castShadow = true;
      g.add(b);

      const x = (rng() - 0.5) * 22;
      const z = (rng() - 0.5) * 22;
      g.position.set(x, 0.4, z);
      scene.add(g);

      state.enemies.push({
        group: g,
        pos: g.position,
        hp: 8 + Math.floor(rng() * 6),
        maxHp: 8,
        t: 0,
      });
    }
  }

  function moveHpBar(e, dmg) {
    log(`Enemy hit for ${dmg}`);
  }

  // World terrain
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(36, 36, 36, 36),
    new THREE.MeshStandardMaterial({ color: 0x4b5c3d, flatShading: true, side: THREE.DoubleSide })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Some rocks/trees
  function spawnProps(rng) {
    for (let i = 0; i < 20; i++) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.8, 5), new THREE.MeshStandardMaterial({ color: 0x8b5a2b, flatShading: true }));
      trunk.position.y = 0.4;
      tree.add(trunk);
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.4, 7), new THREE.MeshStandardMaterial({ color: 0x2f4f2f, flatShading: true }));
      leaves.position.y = 1.35;
      tree.add(leaves);
      tree.position.set((rng() - 0.5) * 30, 0, (rng() - 0.5) * 30);
      tree.castShadow = true;
      tree.receiveShadow = true;
      scene.add(tree);
    }

    for (let i = 0; i < 10; i++) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0x777777, flatShading: true }));
      rock.position.set((rng() - 0.5) * 32, 0.3, (rng() - 0.5) * 32);
      rock.castShadow = true;
      rock.receiveShadow = true;
      scene.add(rock);
    }
  }

  // Navigation + camera orbit
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  const view = {
    yaw: 0,
    pitch: -0.35,
    dist: 16,
    orbiting: false,
  };

  function setCamera() {
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();

    const forward = new THREE.Vector3(
      Math.sin(view.yaw),
      0,
      Math.cos(view.yaw)
    );

    const camPos = playerGroup.position.clone()
      .add(new THREE.Vector3(0, 1.4, 0))
      .addScaledVector(forward, -view.dist);

    camPos.y += 6 + view.dist * 0.1;

    camera.position.copy(camPos);
    camera.lookAt(playerGroup.position.x, 1.2, playerGroup.position.z);
  }

  // Combat
  function gain(skill, xp) {
    const s = state.player.skills[skill];
    s.xp += xp;
    const next = XP(s.level);
    if (s.xp >= next) {
      s.xp -= next;
      s.level++;
      log(`${skill} level up!`);
    }
  }

  function tickCombat() {
    const p = state.player;
    const atkLvl = p.skills.attack.level;

    // nearby enemy
    let nearest = null;
    let nd = Infinity;
    for (const e of state.enemies) {
      const d = e.pos.distanceToSquared(p.pos);
      if (d < nd) {
        nd = d;
        nearest = e;
      }
    }

    const isClose = nearest && nearest.pos.distanceTo(p.pos) < 1.7;
    if (!isClose) return;

    // Attack tick
    const dmg = 1 + atkLvl;
    nearest.hp -= dmg;
    moveHpBar(nearest, dmg);

    p.hp -= 1;

    if (nearest.hp <= 0) {
      state.player.gold += 5;
      gain('attack', 25);
      state.enemies = state.enemies.filter(e => e !== nearest);
      scene.remove(nearest.group);
      log('Enemy defeated');
      if (!state.enemies.length) log('All enemies cleared');
    }

    if (p.hp <= 0) {
      p.hp = p.maxHp;
      p.pos.set(0, 0, 0);
      p.target.copy(p.pos);
      log('You died (respawned)');
    }
  }

  setInterval(tickCombat, 650);

  function updateHud() {
    const p = state.player;
    const atk = p.skills.attack;
    const def = p.skills.defense;
    hud.hp.textContent = p.hp;
    hud.maxHp.textContent = p.maxHp;
    hud.gold.textContent = p.gold;
    hud.atkLvl.textContent = atk.level;
    hud.atkXp.textContent = atk.xp;
    hud.atkNext.textContent = XP(atk.level);
    hud.defLvl.textContent = def.level;
    hud.defXp.textContent = def.xp;
    hud.defNext.textContent = XP(def.level);
  }

  // Input
  window.addEventListener('resize', () => {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  });

  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

  canvas.addEventListener('contextmenu', e => e.preventDefault());

  canvas.addEventListener('pointerdown', e => {
    if (e.button === 2) {
      view.orbiting = true;
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    // left click: raycast
    mouse.x = (e.clientX / canvas.clientWidth) * 2 - 1;
    mouse.y = -(e.clientY / canvas.clientHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // check enemies first
    const enemyObjs = state.enemies.map(e => e.group.children[0]);
    const enemyHits = raycaster.intersectObjects(enemyObjs, false);
    if (enemyHits.length > 0) {
      const hitObj = enemyHits[0].object;
      const targetEnemy = state.enemies.find(e => e.group.children[0] === hitObj);
      if (targetEnemy) {
        state.player.target.copy(targetEnemy.pos);
        log('Engaging enemy');
        return;
      }
    }

    const hits = raycaster.intersectObject(ground, false);
    if (hits.length) {
      state.player.target.copy(hits[0].point);
      log('Moving');
    }
  });

  canvas.addEventListener('pointerup', e => {
    if (e.button === 2) {
      view.orbiting = false;
      canvas.releasePointerCapture(e.pointerId);
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (!view.orbiting) return;
    view.yaw -= e.movementX * 0.005;
    view.pitch = clamp(view.pitch - e.movementY * 0.005, -1.2, -0.1);
  });

  canvas.addEventListener('wheel', e => {
    view.dist = clamp(view.dist + e.deltaY * 0.01, 6, 40);
  });

  el('btnSave').onclick = save;
  el('btnReset').onclick = () => {
    localStorage.removeItem('mudscape3d');
    location.reload();
  };

  // world init
  const rng = createRng(state.rngSeed);
  spawnEnemies(rng);
  spawnProps(rng);

  if (!load()) log('New save created');

  // Main loop
  let last = performance.now();

  function frame(now) {
    const dt = (now - last) / 1000;
    last = now;

    // follow target
    const p = state.player;
    const diff = new THREE.Vector3().subVectors(p.target, p.pos);
    const dist = diff.length();

    const speed = 5;
    if (dist > 0.02) {
      diff.normalize();
      p.pos.addScaledVector(diff, speed * dt);
      // clamp to ground bounds
      p.pos.x = clamp(p.pos.x, -17, 17);
      p.pos.z = clamp(p.pos.z, -17, 17);
    }

    playerGroup.position.set(p.pos.x, 0, p.pos.z);

    updateHud();
    setCamera();

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
