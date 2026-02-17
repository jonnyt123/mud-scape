const PLAYER_ACCEL=26.0, PLAYER_DRAG=10.0, PLAYER_BASE_SPEED=5.2, PLAYER_TURN_SPEED=10.0, ENEMY_SPEED=3.1, TICK_MS=600;
/* Mud Scape 3D v2 - smoother mechanics + detail */
(() => {
  const $ = (id) => document.getElementById(id);
  const hud = { hp: $('hp'), maxHp: $('maxHp'), gold: $('gold'),
    atkLvl: $('atkLvl'), atkXp: $('atkXp'), atkNext: $('atkNext'),
    defLvl: $('defLvl'), defXp: $('defXp'), defNext: $('defNext'), log: $('log') };
  const log = (m) => { const d = document.createElement('div'); d.className='line'; d.textContent=m; hud.log.prepend(d); while (hud.log.childElementCount>14) hud.log.lastElementChild.remove(); };

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const xpNeed=(lvl)=>Math.floor(60*Math.pow(lvl,1.55));

  const STATE = { seed: 2026, worldSize: 95, terrainSeg: 140 };

  const sfx={ctx:null, beep(f,sec){
    try{ if(!this.ctx) this.ctx=new (window.AudioContext||window.webkitAudioContext)();
      const o=this.ctx.createOscillator(), g=this.ctx.createGain();
      o.frequency.value=f; g.gain.value=0.15;
      o.connect(g).connect(this.ctx.destination);
      o.start(); g.gain.exponentialRampToValueAtTime(0.001,this.ctx.currentTime+(sec||0.12));
      o.stop(this.ctx.currentTime+(sec||0.12));
    }catch{ }
  }};

  const player = { pos:new THREE.Vector3(0,0,0), vel:new THREE.Vector3(), yaw:0,
    hp:28, maxHp:28, gold:0,
    skills:{attack:{level:1,xp:0}, defense:{level:1,xp:0}},
  };

  function gainXP(skill,amount){
    const s=player.skills[skill]; s.xp+=amount;
    const need=xpNeed(s.level);
    if(s.xp>=need){ s.xp-=need; s.level++; log(skill.toUpperCase()+" level up → "+s.level); sfx.beep(740,0.1);} }

  function save(){
    const pay={p:{x:player.pos.x,y:player.pos.y,z:player.pos.z,
        vx:player.vel.x,vy:player.vel.y,vz:player.vel.z,
        yaw:player.yaw,hp:player.hp,maxHp:player.maxHp,gold:player.gold,skills:player.skills},
      cam:cameraRig,
    };
    localStorage.setItem('mudscape3d_v2',JSON.stringify(pay));
    log('Saved');
  }

  function load(){
    try{ const raw=localStorage.getItem('mudscape3d_v2'); if(!raw) return false;
      const d=JSON.parse(raw);
      player.pos.set(d.p.x,d.p.y,d.p.z);
      player.vel.set(d.p.vx,d.p.vy,d.p.vz);
      player.yaw=d.p.yaw;
      player.hp=d.p.hp; player.maxHp=d.p.maxHp; player.gold=d.p.gold; player.skills=d.p.skills;
      cameraRig.dist=clamp(d.cam.dist,6,18);
      cameraRig.yaw=d.cam.yaw;
      cameraRig.pitch=clamp(d.cam.pitch,-1.0,-0.15);
      log('Loaded'); return true;
    }catch{return false;}
  }

  const canvas=document.getElementById('c');
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setSize(window.innerWidth,window.innerHeight);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;

  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x111215);
  scene.fog=new THREE.Fog(0x111215,22,70);

  const camera=new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1,200);

  const hemi=new THREE.HemisphereLight(0xddeeff,0x223311,0.7);
  scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xffffff,1.1);
  sun.position.set(16,26,8);
  sun.castShadow=true;
  sun.shadow.camera.left=-35;
  sun.shadow.camera.right=35;
  sun.shadow.camera.top=35;
  sun.shadow.camera.bottom=-35;
  sun.shadow.camera.near=1;
  sun.shadow.camera.far=85;
  sun.shadow.mapSize.set(2048,2048);
  scene.add(sun);

  // deterministic hash noise
  function hash(ix,iz){
    let v=Math.sin(ix*127.1 + iz*311.7 + STATE.seed)*43758.5453;
    return v-Math.floor(v);
  }

  function noise(x,z){
    const scale=18;
    const sx=x/scale, sz=z/scale;
    const ix=Math.floor(sx), iz=Math.floor(sz);
    const fx=sx-ix, fz=sz-iz;
    const s=(t)=>t*t*(3-2*t);
    const v00=hash(ix,iz), v10=hash(ix+1,iz), v01=hash(ix,iz+1), v11=hash(ix+1,iz+1);
    const ux=s(fx), uz=s(fz);
    const a=v00*(1-ux)+v10*ux;
    const b=v01*(1-ux)+v11*ux;
    return a*(1-uz)+b*uz;
  }

  function fbm(x,z){
    let a=1, f=1, sum=0, norm=0;
    for(let i=0;i<4;i++){ sum+=noise(x*f,z*f)*a; norm+=a; a*=0.5; f*=1.85; }
    return sum/norm;
  }

  function height(x,z){
    const base=fbm(x,z);
    const ridge=Math.abs(base-0.5)*2;
    return (base*0.85 + ridge*0.15)*2.25;
  }

  const groundGeo=new THREE.PlaneGeometry(STATE.worldSize,STATE.worldSize,STATE.terrainSeg,STATE.terrainSeg);
  groundGeo.rotateX(-Math.PI/2);
  const pos=groundGeo.attributes.position;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i), z=pos.getZ(i);
    pos.setY(i,height(x,z));
  }
  groundGeo.computeVertexNormals();

  const groundMat=new THREE.MeshStandardMaterial({color:0x4a5f41, roughness:0.98});
  const ground=new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow=true;
  scene.add(ground);

  function sampleGroundY(x,z){ return height(x,z); }

  // props
  function addProp(obj){ obj.castShadow=true; obj.receiveShadow=true; scene.add(obj); }

  function spawnTrees(count){
    const tMat=new THREE.MeshStandardMaterial({color:0x5a3c2a, roughness:1});
    const lMat=new THREE.MeshStandardMaterial({color:0x2f5a2f, roughness:1});
    for(let i=0;i<count;i++){
      const x=(Math.random()-0.5)*(STATE.worldSize-6);
      const z=(Math.random()-0.5)*(STATE.worldSize-6);
      if(Math.hypot(x,z)<5){ i--; continue; }
      const y=sampleGroundY(x,z);
      const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.2,1.6,6), tMat);
      trunk.position.set(x,y+0.8,z);
      const leaves=new THREE.Mesh(new THREE.ConeGeometry(0.9,2.0,8), lMat);
      leaves.position.set(x,y+2.1,z);
      const g=new THREE.Group(); g.add(trunk,leaves); addProp(g);
    }
  }

  function spawnRocks(count){
    const rMat=new THREE.MeshStandardMaterial({color:0x7a7a7a, roughness:0.95});
    for(let i=0;i<count;i++){
      const x=(Math.random()-0.5)*(STATE.worldSize-4);
      const z=(Math.random()-0.5)*(STATE.worldSize-4);
      if(Math.hypot(x,z)<5){ i--; continue; }
      const y=sampleGroundY(x,z);
      const s=lerp(0.45,1.25,Math.random());
      const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(s,0), rMat);
      rock.position.set(x,y+0.25*s,z);
      addProp(rock);
    }
  }

  spawnTrees(220);
  spawnRocks(80);

  // player model
  const playerMesh=new THREE.Group();
  playerMesh.userData.rig=null;
  (function buildPlayer(){
    const skin=new THREE.MeshStandardMaterial({color:0xf2d1a3, roughness:0.98});
    const shirt=new THREE.MeshStandardMaterial({color:0xd8c24f, roughness:0.95});
    const pants=new THREE.MeshStandardMaterial({color:0x2b2b2b, roughness:1});

    const rig={};

    const torso=new THREE.Mesh(new THREE.BoxGeometry(0.78,0.95,0.45), shirt);
    torso.position.y=1.25; torso.castShadow=true;

    const headPivot=new THREE.Group(); headPivot.position.y=2.0;
    const head=new THREE.Mesh(new THREE.BoxGeometry(0.58,0.58,0.58), skin);
    head.castShadow=true;
    headPivot.add(head);

    const armGeo=new THREE.BoxGeometry(0.2,0.75,0.2);
    const armPivotL=new THREE.Group(); armPivotL.position.set(-0.55,1.38,0);
    const armL=new THREE.Mesh(armGeo, shirt);
    armL.position.y=-0.37;
    armL.castShadow=true;
    armPivotL.add(armL);

    const armPivotR=new THREE.Group(); armPivotR.position.set(0.55,1.38,0);
    const armR=armL.clone();
    armR.position.y=-0.37;
    armPivotR.add(armR);

    const legGeo=new THREE.BoxGeometry(0.24,0.8,0.24);
    const legPivotL=new THREE.Group(); legPivotL.position.set(-0.25,0.9,0);
    const legL=new THREE.Mesh(legGeo,pants);
    legL.position.y=-0.4;
    legL.castShadow=true;
    legPivotL.add(legL);

    const legPivotR=new THREE.Group(); legPivotR.position.set(0.25,0.9,0);
    const legR=legL.clone();
    legR.position.y=-0.4;
    legPivotR.add(legR);

    const footGeo=new THREE.BoxGeometry(0.28,0.12,0.48);
    const footL=new THREE.Mesh(footGeo,pants);
    footL.position.set(0,-0.75,0.1);
    const footR=footL.clone();
    legPivotL.add(footL);
    legPivotR.add(footR);

    playerMesh.add(torso,headPivot,armPivotL,armPivotR,legPivotL,legPivotR);
    playerMesh.castShadow=true; playerMesh.receiveShadow=true;

    rig.torso=torso;
    rig.head=headPivot;
    rig.armL=armPivotL;
    rig.armR=armPivotR;
    rig.legL=legPivotL;
    rig.legR=legPivotR;
    playerMesh.userData.rig=rig;

    scene.add(playerMesh);
  })();

  let animT=0;
  function updatePlayerRig(dt){
    const rig = playerMesh.userData?.rig;
    if(!rig) return;
    animT+=dt;
    const speed=Math.hypot(player.vel.x,player.vel.z);
    const move=clamp(speed/(PLAYER_BASE_SPEED*1.1),0,1.35);

    const f=6.6;
    const swing=Math.sin(animT*f)*Math.PI*0.40*move;
    const armSwing=swing*0.8;

    rig.armL.rotation.x = armSwing;
    rig.armR.rotation.x = -armSwing;
    rig.legL.rotation.x = -swing;
    rig.legR.rotation.x = swing;

    const breathe=(1-move)*Math.sin(animT*2.2)*Math.PI*0.02;
    rig.head.rotation.x=breathe;
    rig.torso.position.y=1.25 + Math.abs(Math.sin(animT*f)*0.03*move);
  }

  // floating damage text
  const sprites=[];
  function spawnText(text, pos, color){
    const d=document.createElement('canvas'); d.width=128; d.height=64;
    const ctx=d.getContext('2d');
    ctx.font='bold 20px monospace'; ctx.textAlign='center'; ctx.fillStyle=color;
    ctx.fillText(text,64,38);
    const tex=new THREE.CanvasTexture(d);
    tex.minFilter=THREE.LinearFilter;
    const mat=new THREE.SpriteMaterial({map:tex, transparent:true});
    const s=new THREE.Sprite(mat);
    s.position.copy(pos); s.position.y+=2.0;
    s.scale.set(1.1,0.55,1);
    s.userData.birth=performance.now();
    sprites.push(s); scene.add(s);
  }

  // enemies
  const enemies=[];
  function makeEnemy(x,z){
    const mat=new THREE.MeshStandardMaterial({color:0x933f3f, roughness:1});
    const m=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.9,0.9),mat);
    const y=sampleGroundY(x,z);
    m.position.set(x,y+0.45,z);
    m.castShadow=true;
    m.userData={hp:10, alive:true, home:{x,z}, state:'wander', t:0, target:{x,y:z}, lastHitAt:0};
    enemies.push(m); scene.add(m);
  }

  for(let i=0;i<12;i++){
    const x=(Math.random()-0.5)* (STATE.worldSize-10);
    const z=(Math.random()-0.5)* (STATE.worldSize-10);
    if(Math.hypot(x,z)<6){ i--; continue; }
    makeEnemy(x,z);
  }

  // raycast
  const raycaster=new THREE.Raycaster();
  const mouse=new THREE.Vector2();

  // camera rig
  const cameraRig={yaw:0, pitch:-0.35, dist:9.5};
  let cameraPos=new THREE.Vector3(0,10,10);
  let pendingMove=null;
  let orbiting=false;

  function updateCamera(dt){
    cameraRig.dist=clamp(cameraRig.dist,6,18);
    cameraRig.pitch=clamp(cameraRig.pitch,-1.2,-0.12);

    const yaw=cameraRig.yaw, pitch=cameraRig.pitch;
    const offset=new THREE.Vector3(
      Math.sin(yaw)*Math.cos(pitch),
      Math.sin(-pitch),
      Math.cos(yaw)*Math.cos(pitch)
    ).multiplyScalar(cameraRig.dist);

    const target=new THREE.Vector3(player.pos.x, player.pos.y+1.5, player.pos.z);
    target.y+=5.0;
    const desired=target.clone().sub(offset);

    const spring=18;
    cameraPos.lerp(desired, clamp(spring*dt,0,1));
    camera.position.copy(cameraPos);
    camera.lookAt(player.pos.x, player.pos.y+1.2, player.pos.z);
    camera.aspect=canvas.clientWidth/canvas.clientHeight;
    camera.updateProjectionMatrix();
  }

  function setMoveTarget(worldPoint){
    pendingMove=worldPoint.clone();
  }

  function handlePointerDown(e){
    canvas.setPointerCapture(e.pointerId);
    if(e.button===2){ orbiting=true; return; }

    mouse.x=(e.clientX/canvas.clientWidth)*2-1;
    mouse.y=-(e.clientY/canvas.clientHeight)*2+1;
    raycaster.setFromCamera(mouse,camera);

    // enemies first
    const enemyHits=raycaster.intersectObjects(enemies.filter(o=>o.userData.alive), false);
    if(enemyHits.length){
      setMoveTarget(enemyHits[0].object.position);
      log('Target acquired');
      return;
    }

    const groundHit=raycaster.intersectObject(ground,false);
    if(groundHit.length){
      setMoveTarget(groundHit[0].point);
      log('Moving');
    }
  }

  function handlePointerMove(e){
    if(!orbiting) return;
    cameraRig.yaw -= e.movementX*0.005;
    cameraRig.pitch -= e.movementY*0.005;
  }
  function handlePointerUp(e){
    if(e.button===2){ orbiting=false; }
    canvas.releasePointerCapture?.(e.pointerId);
  }

  canvas.addEventListener('contextmenu', e=>e.preventDefault());
  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('wheel', e=>cameraRig.dist += e.deltaY*0.01);

  window.addEventListener('resize', ()=>{
    renderer.setSize(window.innerWidth,window.innerHeight);
  });

  document.getElementById('btnSave').onclick=save;
  document.getElementById('btnReset').onclick=()=>{ localStorage.removeItem('mudscape3d_v2'); location.reload(); };

  // load save if present
  load();

  // combat tick
  let tickAcc=0;
  function tick(){
    // find nearest enemy within 1.6m
    let best=null, bestDist=1.6;
    const p=player.pos;
    for(const e of enemies){
      if(!e.userData.alive) continue;
      const d=e.position.distanceTo(p);
      if(d<bestDist){ bestDist=d; best=e; }
    }
    if(!best) return;

    const dmg=1 + player.skills.attack.level;
    best.userData.hp-=dmg;
    spawnText('-'+dmg,best.position.clone(),'#ff4444');
    player.hp-=1;
    spawnText('-1',new THREE.Vector3(p.x,p.y+1.5,p.z),'#ffaa00');
    sfx.beep(320,0.08);

    if(best.userData.hp<=0){
      best.userData.alive=false;
      scene.remove(best);
      player.gold += 7;
      gainXP('attack',22);
      log('Enemy defeated');
    }

    if(player.hp<=0){
      player.hp=player.maxHp;
      player.pos.set(0,0,0);
      player.vel.set(0,0,0);
      pendingMove=null;
      log('Respawned');
    }
  }

  // enemy AI
  function updateEnemies(dt){
    const p=player.pos;
    for(const e of enemies){
      if(!e.userData.alive) continue;
      const ud=e.userData;
      const pos=e.position;

      // slightly float with terrain
      pos.y=sampleGroundY(pos.x,pos.z)+0.45;

      const toPlayer=pos.distanceTo(p);
      if(toPlayer<10){ ud.state='chase'; }

      if(ud.state==='wander'){
        ud.t-=dt;
        if(ud.t<=0 || !ud.target){
          ud.t=1.8+Math.random()*2.4;
          const angle=Math.random()*Math.PI*2;
          const r=3+Math.random()*5.5;
          ud.target={
            x:ud.home.x + Math.cos(angle)*r,
            z:ud.home.z + Math.sin(angle)*r
          };
        }
        const tx=ud.target.x, tz=ud.target.z;
        const d=Math.hypot(tx-pos.x, tz-pos.z);
        if(d>0.05){
          pos.x += ((tx-pos.x)/d)*ENEMY_SPEED*dt;
          pos.z += ((tz-pos.z)/d)*ENEMY_SPEED*dt;
        }
      }

      if(ud.state==='chase'){
        if(toPlayer>18){ ud.state='wander'; continue; }
        if(toPlayer>0.05){
          pos.x += ((p.x-pos.x)/toPlayer)*ENEMY_SPEED*1.08*dt;
          pos.z += ((p.z-pos.z)/toPlayer)*ENEMY_SPEED*1.08*dt;
        }
      }

      // clamp world bounds
      pos.x=clamp(pos.x, -STATE.worldSize/2+1, STATE.worldSize/2-1);
      pos.z=clamp(pos.z, -STATE.worldSize/2+1, STATE.worldSize/2-1);
    }
  }

  function updateSprites(now){
    const LIFE=950;
    for(let i=sprites.length-1;i>=0;i--){
      const s=sprites[i];
      const age=now - s.userData.birth;
      const a=clamp(1-age/LIFE,0,1);
      s.material.opacity=a;
      s.position.y += 0.0008*age; // ease upward
      if(age>=LIFE){ scene.remove(s); sprites.splice(i,1); }
    }
  }

  function updateHUD(){
    hud.hp.textContent=player.hp;
    hud.maxHp.textContent=player.maxHp;
    hud.gold.textContent=player.gold;
    const atk=player.skills.attack, def=player.skills.defense;
    hud.atkLvl.textContent=atk.level; hud.atkXp.textContent=atk.xp; hud.atkNext.textContent=xpNeed(atk.level);
    hud.defLvl.textContent=def.level; hud.defXp.textContent=def.xp; hud.defNext.textContent=xpNeed(def.level);
  }

  function stepPlayer(dt){
    const accel = PLAYER_ACCEL;
    const drag  = PLAYER_DRAG;

    // accelerate toward pending target
    if(pendingMove){
      const diff=pendingMove.clone().sub(player.pos);
      const dist=diff.length();
      diff.y=0;
      if(dist<0.55){
        pendingMove=null;
        player.vel.multiplyScalar(0.75);
      } else {
        diff.normalize();
        const desiredSpeed = PLAYER_BASE_SPEED;
        player.vel.x += diff.x * accel * dt;
        player.vel.z += diff.z * accel * dt;
        const speed=Math.hypot(player.vel.x,player.vel.z);
        if(speed>desiredSpeed){
          const k=desiredSpeed/speed; player.vel.x*=k; player.vel.z*=k;
        }
        // yaw toward move direction
        const targetYaw=Math.atan2(diff.x,diff.z);
        let dy=targetYaw - player.yaw;
        while(dy>Math.PI) dy-=Math.PI*2;
        while(dy<-Math.PI) dy+=Math.PI*2;
        player.yaw += clamp(dy,-PLAYER_TURN_SPEED*dt, PLAYER_TURN_SPEED*dt);
      }
    }

    // drag
    player.vel.x -= player.vel.x * drag * dt;
    player.vel.z -= player.vel.z * drag * dt;

    // integrate
    player.pos.x += player.vel.x * dt;
    player.pos.z += player.vel.z * dt;

    // height / bounds
    player.pos.y = sampleGroundY(player.pos.x, player.pos.z);
    player.pos.x = clamp(player.pos.x, -STATE.worldSize/2+1.5, STATE.worldSize/2-1.5);
    player.pos.z = clamp(player.pos.z, -STATE.worldSize/2+1.5, STATE.worldSize/2-1.5);

    // update mesh
    playerMesh.position.set(player.pos.x, player.pos.y, player.pos.z);
    playerMesh.rotation.y = player.yaw;
    updatePlayerRig(dt);
  }

  let last=performance.now();
  function loop(now){
    const dt=Math.min((now-last)/1000,0.05);
    last=now;

    tickAcc += dt*1000;
    while(tickAcc>=TICK_MS){ tick(); tickAcc-=TICK_MS; }

    stepPlayer(dt);
    updateEnemies(dt);
    updateCamera(dt);
    updateSprites(now);
    updateHUD();

    renderer.render(scene,camera);
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
