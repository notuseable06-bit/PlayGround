import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#a9c5cb');
  scene.fog = new THREE.Fog('#a9c5cb', 58, 155);
  const camera3d = new THREE.PerspectiveCamera(58, 1, 0.1, 240);
  const worldGroup = new THREE.Group(); scene.add(worldGroup);
  const ctx = null;
  const mini = document.getElementById('minimap'), mctx = mini.getContext('2d');
  const $ = id => document.getElementById(id);
  const WORLD = { w: 2600, h: 1900 }, roadW = 112, blockW = 300, stride = blockW + roadW;
  let W = 0, H = 0, dpr = 1, started = false, paused = false, inCar = false, car = null, cash = 2450, step = 0, heat = 0, muted = false, last = 0, toastTimer = 0, selectedMode = 'story', gameMode = 'story', peer = null, dataChannel = null, lastSync = 0, nitro = 100, stashesCollected = 0, worldMinutes = 18 * 60 + 42, weatherElapsed = 0, weatherIndex = 0;
  const keys = Object.create(null), camera = {x: 0, y: 0};
  const player = {x: 468, y: 468, angle: -Math.PI / 2, speed: 0, walk: 0};
  const secondPlayer = {x: 510, y: 468, angle: -Math.PI / 2};
  const remotePlayer = {x: 670, y: 520, angle: -Math.PI / 2, connected: false};
  const destinations = [{x: 878,y: 468,label:'PACKAGE PICKUP',name:'Market Street'}, {x:1900,y:1236,label:'FIRST DROP',name:'Marina Vista'}, {x:520,y:1510,label:'FINAL DELIVERY',name:'Old Town'}];
  const blocks = [], trees = [], traffic = [], parked = [];
  const stashSpots = [{x:468,y:56},{x:880,y:468},{x:1704,y:56},{x:56,y:880},{x:1292,y:1292},{x:2116,y:880},{x:468,y:1704},{x:2528,y:1292}];
  const stashes = stashSpots.map((p,i)=>({...p,collected:false,phase:i*.9}));
  const palette = ['#d5c6a9','#c9d0c0','#d3c9b5','#b8c5b6','#d9d4c6','#b9c9c4','#d4c4ae'];
  function resize(){dpr=Math.min(window.devicePixelRatio||1,1.75);W=innerWidth;H=innerHeight;renderer.setPixelRatio(dpr);renderer.setSize(W,H,false);camera3d.aspect=W/H;camera3d.updateProjectionMatrix();canvas.style.width=W+'px';canvas.style.height=H+'px'}
  window.addEventListener('resize',resize); resize();
  // Procedural city grid: wide boulevards, shaded sidewalks, parks, buildings and palms.
  for(let y=0,ri=0;y<WORLD.h;y+=stride,ri++) for(let x=0,ci=0;x<WORLD.w;x+=stride,ci++){
    const bx=x+roadW+10, by=y+roadW+10, bw=Math.min(blockW-20,WORLD.w-bx-9), bh=Math.min(blockW-20,WORLD.h-by-9);
    if(bw<60||bh<60)continue;
    const park=((ci*13+ri*7)%11===2)||((ci===4&&ri===2));
    const lot={x:bx,y:by,w:bw,h:bh,park, buildings:[]};
    if(!park){let seed=(ci*19+ri*31+9)%100, count=seed>76?1:seed>45?2:3;for(let n=0;n<count;n++){
      const cols=count===1?1:2, rows=Math.ceil(count/cols), cw=(bw-27-(cols-1)*11)/cols, ch=(bh-27-(rows-1)*12)/rows;
      const xx=bx+13+(n%cols)*(cw+11), yy=by+13+Math.floor(n/cols)*(ch+12), inset=(n*7+seed)%13;
      lot.buildings.push({x:xx+inset,y:yy+inset,w:Math.max(52,cw-inset*1.5),h:Math.max(54,ch-inset*1.4),color:palette[(seed+n*3)%palette.length],hue:(seed+n*17)%40});
    }} else {for(let n=0;n<15;n++)trees.push({x:bx+18+((n*73+ri*19)%Math.max(30,bw-36)),y:by+22+((n*49+ci*21)%Math.max(30,bh-42)),r:9+(n%3)*2});}
    blocks.push(lot);
  }
  function isRoad(x,y){let rx=((x%stride)+stride)%stride, ry=((y%stride)+stride)%stride;return rx<roadW||ry<roadW}
  // Find clear road parking positions.
  for(let i=0;i<18;i++) {let x=235+(i*197)%2200, y=182+(i*283)%1600;if(isRoad(x,y)&&Math.random()>.35)parked.push({x,y,angle:((i%2)?0:Math.PI/2),speed:0,fuel:86,color:['#bd6648','#d1d1c5','#457e83','#c4a34d','#4e5960'][i%5],name:['Vesper Coupe','Cobalt Sedan','Sunliner','Mesa Classic','Harbor Compact'][i%5],occupied:false});}
  for(let i=0;i<12;i++)traffic.push({x:150+(i*223)%2300,y:166+(i*191)%1650,axis:i%2?'x':'y',dir:i%3===0?-1:1,speed:30+(i*7)%25,color:['#758376','#a76f58','#d0b886','#6a7b86'][i%4],phase:i*3});
  const SCALE=.05, to3=(x,y)=>new THREE.Vector3((x-WORLD.w/2)*SCALE,0,(y-WORLD.h/2)*SCALE);
  const mat=(color,roughness=.88)=>new THREE.MeshStandardMaterial({color,roughness});
  const groundMat=mat('#859c7b'), roadMat=mat('#424b4c'), sidewalkMat=mat('#b9b29f'), lineMat=mat('#ddd3a0'), windowMat=new THREE.MeshStandardMaterial({color:'#91b4b1',roughness:.35,metalness:.12});
  const boxGeo=new THREE.BoxGeometry(1,1,1), sphereGeo=new THREE.SphereGeometry(1,12,8), cylGeo=new THREE.CylinderGeometry(.12,.16,1,8);
  const cityLights=new THREE.HemisphereLight('#e5f4ed','#68745d',2.05);scene.add(cityLights);
  const sun=new THREE.DirectionalLight('#fff0d4',2.3);sun.position.set(-35,58,25);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-80;sun.shadow.camera.right=80;sun.shadow.camera.top=80;sun.shadow.camera.bottom=-80;scene.add(sun);
  const staticMeshes=[];
  const nightSky=new THREE.Color('#172630'), daySky=new THREE.Color('#a9c5cb'), nightFog=new THREE.Color('#26333b'), dayFog=new THREE.Color('#a9c5cb');
  const weatherKinds=['CLEAR','MIST','RAIN'];
  const rainCount=260, rainPositions=new Float32Array(rainCount*3), rainSpeeds=new Float32Array(rainCount);
  for(let i=0;i<rainCount;i++){rainPositions[i*3]=(Math.random()-.5)*28;rainPositions[i*3+1]=Math.random()*16;rainPositions[i*3+2]=(Math.random()-.5)*28;rainSpeeds[i]=8+Math.random()*8}
  const rainGeometry=new THREE.BufferGeometry();rainGeometry.setAttribute('position',new THREE.BufferAttribute(rainPositions,3));
  const rainMaterial=new THREE.PointsMaterial({color:'#d9e8ed',size:.07,transparent:true,opacity:.55,depthWrite:false});
  const rainPoints=new THREE.Points(rainGeometry,rainMaterial);rainPoints.visible=false;scene.add(rainPoints);
  function addBox(parent,geo,material,x,y,z,sx,sy,sz,cast=false,receive=true){const o=new THREE.Mesh(geo,material);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.castShadow=cast;o.receiveShadow=receive;parent.add(o);return o}
  function buildCity(){
    const ground=addBox(worldGroup,boxGeo,groundMat,0,-.22,0,WORLD.w*SCALE+5,.4,WORLD.h*SCALE+5);ground.receiveShadow=true;
    for(let x=0;x<WORLD.w;x+=stride){const p=to3(x+roadW/2,WORLD.h/2);addBox(worldGroup,boxGeo,roadMat,p.x,-.012,0,roadW*SCALE,.035,WORLD.h*SCALE,false);}
    for(let y=0;y<WORLD.h;y+=stride){const p=to3(WORLD.w/2,y+roadW/2);addBox(worldGroup,boxGeo,roadMat,0,-.01,p.z,WORLD.w*SCALE,.035,roadW*SCALE,false);}
    // Raised sidewalks, lane dashes, landscaped medians, and individual building masses.
    const windowTransforms=[];
    for(const lot of blocks){const lp=to3(lot.x+lot.w/2,lot.y+lot.h/2);addBox(worldGroup,boxGeo,lot.park?mat('#76916d') : sidewalkMat,lp.x,.015,lp.z,lot.w*SCALE,.12,lot.h*SCALE,false);
      if(lot.park){for(let n=0;n<trees.length;n++){const t=trees[n];if(t.x<lot.x||t.x>lot.x+lot.w||t.y<lot.y||t.y>lot.y+lot.h)continue;const p=to3(t.x,t.y),tree=new THREE.Group();tree.position.set(p.x,0,p.z);addBox(tree,cylGeo,mat('#6a5540'),0,.75,0,.22,1.5,.22,true);const crown=addBox(tree,sphereGeo,mat(n%3?'#3e704b':'#527c50'),0,1.8,0,1.55,1.25,1.55,true);crown.castShadow=true;worldGroup.add(tree);}
        continue;
      }
      for(const b of lot.buildings){const p=to3(b.x+b.w/2,b.y+b.h/2),w=b.w*SCALE,d=b.h*SCALE,height=2.8+((Math.floor(b.x+b.y)%7)*.47);const building=addBox(worldGroup,boxGeo,mat(b.color),p.x,height/2,p.z,w,height,d,true);building.castShadow=true;
        addBox(worldGroup,boxGeo,mat('#a29d89'),p.x,height+.045,p.z,w*1.04,.09,d*1.04,false);
        const floors=Math.floor(height/.52),cols=Math.max(2,Math.floor(w/.65));for(let f=1;f<floors;f++)for(let c=0;c<cols;c++){const wx=p.x-w*.36+c*(w*.72/Math.max(1,cols-1)),wy=f*.48;windowTransforms.push([wx,wy,p.z+d/2+.009]);}
      }
    }
    const windows=new THREE.InstancedMesh(boxGeo,windowMat,windowTransforms.length),windowDummy=new THREE.Object3D();
    windowTransforms.forEach(([x,y,z],i)=>{windowDummy.position.set(x,y,z);windowDummy.scale.set(.19,.16,.025);windowDummy.updateMatrix();windows.setMatrixAt(i,windowDummy.matrix)});
    windows.instanceMatrix.needsUpdate=true;worldGroup.add(windows);
    for(let x=0;x<WORLD.w;x+=stride)for(let y=0;y<WORLD.h;y+=42){const p=to3(x+roadW/2,y+roadW/2);addBox(worldGroup,boxGeo,lineMat,p.x,.012,p.z,.07,.012,.82,false);}
    // Road-side lamps give the streets depth at player height.
    const lampMat=mat('#39423d'),glowMat=new THREE.MeshBasicMaterial({color:'#f7dda0'});
    for(let x=roadW;x<WORLD.w;x+=stride)for(let y=roadW;y<WORLD.h;y+=stride){const p=to3(x+12,y+roadW-12);addBox(worldGroup,cylGeo,lampMat,p.x,.95,p.z,.08,1.9,.08);addBox(worldGroup,sphereGeo,glowMat,p.x,1.95,p.z,.15,.1,.15);}
  }
  function makeCar(color){const g=new THREE.Group(),paint=mat(color,.45),glass=mat('#37535a',.28),tire=mat('#202321');addBox(g,boxGeo,paint,0,.38,0,1.6,.48,2.7,true);addBox(g,boxGeo,paint,0,.78,-.18,1.28,.48,1.38,true);addBox(g,boxGeo,glass,0,.8,.54,1.22,.34,.06);addBox(g,boxGeo,glass,0,.8,-.91,1.18,.34,.06);for(const x of [-.78,.78])for(const z of [-.85,.85]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.28,.28,.18,12),tire);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.26,z);g.add(wheel);}const lights=mat('#ffe3a3');for(const x of [-.52,.52])addBox(g,boxGeo,lights,x,.43,1.36,.2,.13,.04);return g}
  function makePerson(color){const g=new THREE.Group(),skin=mat('#d6a77b'),shirt=mat(color),pants=mat('#26342f');const body=addBox(g,boxGeo,shirt,0,.88,0,.56,.82,.34,true);addBox(g,sphereGeo,skin,0,1.48,0,.23,.25,.23,true);for(const x of [-.17,.17])addBox(g,boxGeo,pants,x,.32,0,.19,.58,.22,true);return g}
  buildCity();
  const stashMeshes=stashes.map((stash,i)=>{const group=new THREE.Group(),gold=mat('#d8b958',.42),dark=mat('#66522b',.7),v=to3(stash.x,stash.y);addBox(group,boxGeo,dark,0,.24,0,.5,.4,.42,true);addBox(group,boxGeo,gold,0,.31,0,.43,.22,.38,true);addBox(group,boxGeo,mat('#fff0a5',.25),0,.31,.2,.2,.1,.025);const ring=new THREE.Mesh(new THREE.TorusGeometry(.48,.025,6,20),new THREE.MeshBasicMaterial({color:'#eaff8b',transparent:true,opacity:.8}));ring.rotation.x=Math.PI/2;ring.position.y=.08;group.add(ring);group.position.set(v.x,0,v.z);worldGroup.add(group);return group});
  const playerCarMesh=makeCar('#bd6648');worldGroup.add(playerCarMesh);
  const playerMesh=makePerson('#263a33');worldGroup.add(playerMesh);
  const secondMesh=makePerson('#4e6574');worldGroup.add(secondMesh);
  const remoteMesh=makePerson('#9c7658');worldGroup.add(remoteMesh);
  const parkedMeshes=parked.map(c=>{const mesh=makeCar(c.color);worldGroup.add(mesh);return mesh});
  const trafficMeshes=traffic.map(t=>{const mesh=makeCar(t.color);worldGroup.add(mesh);return mesh});
  const marker=new THREE.Group();worldGroup.add(marker);const markerRing=new THREE.Mesh(new THREE.TorusGeometry(1.05,.07,8,32),new THREE.MeshBasicMaterial({color:'#d8ff58'}));markerRing.rotation.x=Math.PI/2;marker.add(markerRing);const markerBeam=addBox(marker,boxGeo,new THREE.MeshBasicMaterial({color:'#e4ff83',transparent:true,opacity:.38}),0,1.15,0,.08,2.3,.08,false);const markerLight=new THREE.PointLight('#d8ff58',2.6,7);markerLight.position.y=2;marker.add(markerLight);
  function sync3D(dt){const active=inCar?car:player,p=to3(active.x,active.y);playerMesh.visible=!inCar;playerCarMesh.visible=inCar;playerMesh.position.set(p.x,.09,p.z);playerMesh.rotation.y=Math.PI/2-player.angle;playerCarMesh.position.set(p.x,.08,p.z);playerCarMesh.rotation.y=Math.PI/2-(car?car.angle:player.angle);
    secondMesh.visible=gameMode==='local';let q=to3(secondPlayer.x,secondPlayer.y);secondMesh.position.set(q.x,.09,q.z);secondMesh.rotation.y=Math.PI/2-secondPlayer.angle;
    remoteMesh.visible=gameMode==='online'&&remotePlayer.connected;q=to3(remotePlayer.x,remotePlayer.y);remoteMesh.position.set(q.x,.09,q.z);remoteMesh.rotation.y=Math.PI/2-remotePlayer.angle;
    parked.forEach((c,i)=>{parkedMeshes[i].visible=!c.occupied;const v=to3(c.x,c.y);parkedMeshes[i].position.set(v.x,.08,v.z);parkedMeshes[i].rotation.y=Math.PI/2-c.angle});
    stashes.forEach((s,i)=>{stashMeshes[i].visible=!s.collected;if(!s.collected){stashMeshes[i].position.y=.06+Math.sin(performance.now()/420+s.phase)*.08;stashMeshes[i].rotation.y=performance.now()/900+s.phase}});
    traffic.forEach((t,i)=>{const v=to3(t.x,t.y);trafficMeshes[i].position.set(v.x,.08,v.z);trafficMeshes[i].rotation.y=Math.PI/2-(t.axis==='x'?(t.dir>0?0:Math.PI):(t.dir>0?Math.PI/2:-Math.PI/2))});
    if(step<destinations.length){const d=destinations[step],v=to3(d.x,d.y);marker.visible=true;marker.position.set(v.x,.1+Math.sin(performance.now()/350)*.12,v.z);marker.rotation.y=performance.now()/1200;}else marker.visible=false;
    const angle=active.angle||0,forward=new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));const followDistance=inCar?10:8;const desired=new THREE.Vector3(p.x-forward.x*followDistance,inCar?8.5:7.5,p.z-forward.z*followDistance);camera3d.position.lerp(desired,1-Math.pow(.001,dt));const look=new THREE.Vector3(p.x,1.1,p.z);camera3d.lookAt(look);
  }
  function screen(x,y){return{x:x-camera.x,y:y-camera.y}}
  function rounded(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
  function drawGround(){
    ctx.fillStyle='#9bb49a';ctx.fillRect(0,0,W,H);
    // grassy lots and paved plazas
    for(const b of blocks){let p=screen(b.x,b.y);if(p.x>W+350||p.y>H+350||p.x+b.w<-350||p.y+b.h<-350)continue;
      if(b.park){ctx.fillStyle='#739578';ctx.fillRect(p.x,p.y,b.w,b.h);ctx.fillStyle='#b9b89d';ctx.fillRect(p.x+b.w*.45,p.y,8,b.h);ctx.fillRect(p.x,p.y+b.h*.55,b.w,7);for(let n=0;n<5;n++){ctx.fillStyle='#d8d1b3';ctx.fillRect(p.x+18+n*37,p.y+b.h*.35,20,3)}}
      else{ctx.fillStyle='#b6ae98';ctx.fillRect(p.x,p.y,b.w,b.h);ctx.fillStyle='#c8c0ab';ctx.fillRect(p.x+4,p.y+4,b.w-8,b.h-8);}
    }
    // Roads span the entire map; markings are drawn in world-space for stable camera motion.
    // road surfaces as repeated broad streets
    for(let x=0;x<WORLD.w;x+=stride){let sx=x-camera.x;ctx.fillStyle='#555d5b';ctx.fillRect(sx,-camera.y,roadW,WORLD.h);ctx.fillStyle='#858b7e';ctx.fillRect(sx+roadW-5,-camera.y,5,WORLD.h);ctx.fillStyle='#777f75';ctx.fillRect(sx+roadW,-camera.y,8,WORLD.h)}
    for(let y=0;y<WORLD.h;y+=stride){let sy=y-camera.y;ctx.fillStyle='#555d5b';ctx.fillRect(-camera.x,sy,WORLD.w,roadW);ctx.fillStyle='#858b7e';ctx.fillRect(-camera.x,sy+roadW-5,WORLD.w,5);ctx.fillStyle='#777f75';ctx.fillRect(-camera.x,sy+roadW,WORLD.w,8)}
    // broken center lines and crosswalks
    ctx.fillStyle='#d7cf9f';for(let x=0;x<WORLD.w;x+=stride)for(let y=0;y<WORLD.h;y+=40){let sx=x+roadW/2-camera.x,sy=y+roadW/2-camera.y;ctx.fillRect(sx-1,sy,2,15);ctx.fillRect(sx-1,sy-10,2,15)}
    ctx.fillStyle='#d8d7c6';for(let x=0;x<WORLD.w;x+=stride)for(let y=0;y<WORLD.h;y+=stride){let sx=x-camera.x,sy=y-camera.y;for(let k=0;k<6;k++){ctx.fillRect(sx+6+k*7,sy+roadW-16,4,9);ctx.fillRect(sx+roadW-16,sy+6+k*7,9,4)}}
    // Avenue planted medians
    ctx.fillStyle='#839679';for(let x=0;x<WORLD.w;x+=stride*3){let sx=x+roadW-2-camera.x;ctx.fillRect(sx,-camera.y,5,WORLD.h)}
  }
  function drawBuildings(){
    for(const lot of blocks){if(lot.park)continue;for(const b of lot.buildings){let p=screen(b.x,b.y),x=p.x,y=p.y;if(x>W+350||y>H+350||x+b.w<-350||y+b.h<-350)continue;
      // soft cast shadow and raised side give a miniature, dimensional city feel
      ctx.fillStyle='rgba(25,34,27,.24)';rounded(x+8,y+12,b.w,b.h,3);
      ctx.fillStyle='#aaa894';ctx.fillRect(x+5,y+7,b.w,b.h);
      ctx.fillStyle=b.color;rounded(x,y,b.w,b.h,2);
      ctx.fillStyle='rgba(255,255,255,.19)';ctx.fillRect(x+4,y+4,b.w-8,4);
      ctx.fillStyle='rgba(83,100,86,.23)';ctx.fillRect(x+6,y+11,b.w-12,3);
      // rooftop facade detail, roof machinery and skylights
      const cols=Math.max(2,Math.floor(b.w/24));for(let c=0;c<cols;c++){const wx=x+10+c*((b.w-20)/cols);ctx.fillStyle=(c%3===0)?'#68766d':'#859184';ctx.fillRect(wx,y+17,8,Math.min(7,b.h*.1));}
      if(b.w>65&&b.h>75){ctx.fillStyle='#b4b8a5';ctx.fillRect(x+b.w*.58,y+b.h*.53,b.w*.25,b.h*.25);ctx.fillStyle='rgba(68,91,84,.34)';ctx.fillRect(x+b.w*.61,y+b.h*.56,b.w*.19,b.h*.19)}
      ctx.fillStyle='rgba(54,73,63,.22)';ctx.fillRect(x+8,y+b.h-11,b.w-16,5);
    }}
    for(const t of trees){const p=screen(t.x,t.y);if(p.x<-30||p.x>W+30||p.y<-30||p.y>H+30)continue;ctx.fillStyle='rgba(32,47,37,.28)';ctx.beginPath();ctx.ellipse(p.x+3,p.y+5,t.r*1.2,t.r*.72,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#675f48';ctx.fillRect(p.x-2,p.y-2,4,9);ctx.fillStyle='#416d4d';ctx.beginPath();ctx.arc(p.x,p.y,t.r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#62875c';ctx.beginPath();ctx.arc(p.x-3,p.y-4,t.r*.6,0,Math.PI*2);ctx.fill()}
    // street lamps and small shop awnings on sidewalks
    for(let x=roadW;x<WORLD.w;x+=stride)for(let y=roadW;y<WORLD.h;y+=stride){let p=screen(x+9,y+roadW-12);ctx.fillStyle='#414b43';ctx.fillRect(p.x,p.y,2,11);ctx.fillStyle='#f0dfa2';ctx.beginPath();ctx.arc(p.x+1,p.y,3,0,Math.PI*2);ctx.fill()}
  }
  function drawCar(x,y,angle,color,isPlayer=false){const p=screen(x,y);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);ctx.fillStyle='rgba(15,21,17,.4)';rounded(-16,-7,36,19,6);ctx.fillStyle='#252b29';rounded(-17,-9,34,18,5);ctx.fillStyle=color;rounded(-15,-8,30,15,4);ctx.fillStyle='rgba(199,223,213,.78)';rounded(-5,-6,12,11,3);ctx.fillStyle='rgba(35,52,53,.84)';ctx.fillRect(-3,-5,8,9);ctx.fillStyle='#f5e5ad';ctx.fillRect(12,-5,2,3);ctx.fillRect(12,2,2,3);ctx.fillStyle='#a94c3e';ctx.fillRect(-15,-5,2,3);ctx.fillRect(-15,2,2,3);if(isPlayer){ctx.strokeStyle='#e7ff88';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,20,12,0,0,Math.PI*2);ctx.stroke()}ctx.restore()}
  function drawWorldObjects(){
    for(const t of traffic){const jitter=Math.sin(t.phase)*10;drawCar(t.x+(t.axis==='x'?jitter:0),t.y+(t.axis==='y'?jitter:0),t.axis==='x'?(t.dir>0?0:Math.PI):(t.dir>0?Math.PI/2:-Math.PI/2),t.color)}
    for(const c of parked){if(c.occupied)continue;drawCar(c.x,c.y,c.angle,c.color);}
    // glowing job destination beacon and pulsing ring
    if(step<destinations.length){const d=destinations[step],p=screen(d.x,d.y),pulse=1+Math.sin(performance.now()/220)*.13;if(p.x>-70&&p.x<W+70&&p.y>-70&&p.y<H+70){ctx.save();ctx.translate(p.x,p.y);ctx.strokeStyle='rgba(216,255,88,.78)';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,26*pulse,15*pulse,0,0,Math.PI*2);ctx.stroke();ctx.fillStyle='rgba(216,255,88,.17)';ctx.beginPath();ctx.arc(0,0,20,0,Math.PI*2);ctx.fill();ctx.fillStyle='#e5ff86';ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f2f4e9';ctx.font='700 9px DM Sans';ctx.textAlign='center';ctx.fillText(d.label,0,-29);ctx.restore()}}
    const x=inCar?car.x:player.x,y=inCar?car.y:player.y,a=inCar?car.angle:player.angle;
    if(inCar)drawCar(x,y,a,car.color,true);else drawPerson(x,y,a,'#263a33',true);
    if(gameMode==='local')drawPerson(secondPlayer.x,secondPlayer.y,secondPlayer.angle,'#4e6574',false);
    if(gameMode==='online'&&remotePlayer.connected)drawPerson(remotePlayer.x,remotePlayer.y,remotePlayer.angle,'#4e6574',false);
  }
  function drawPerson(x,y,a,color,isMain){const p=screen(x,y);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(a);ctx.fillStyle='rgba(20,29,23,.35)';ctx.beginPath();ctx.ellipse(2,5,8,5,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d8a675';ctx.beginPath();ctx.arc(0,-2,5,0,Math.PI*2);ctx.fill();ctx.fillStyle=color;rounded(-4,1,8,10,3);ctx.fillStyle='#e7d4a9';ctx.fillRect(-5,3,3,4);ctx.fillRect(2,3,3,4);if(isMain){ctx.strokeStyle='#e7ff88';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,4,10,0,Math.PI*2);ctx.stroke()}ctx.restore()}
  function drawMinimap(){const w=180,h=180;mctx.clearRect(0,0,w,h);mctx.fillStyle='#26332d';mctx.fillRect(0,0,w,h);let sx=w/WORLD.w,sy=h/WORLD.h;
    mctx.fillStyle='#777f75';for(let x=0;x<WORLD.w;x+=stride)mctx.fillRect(x*sx,0,roadW*sx,h);for(let y=0;y<WORLD.h;y+=stride)mctx.fillRect(0,y*sy,w,roadW*sy);
    mctx.fillStyle='#839b78';for(const b of blocks)if(b.park)mctx.fillRect(b.x*sx,b.y*sy,b.w*sx,b.h*sy);
    if(step<destinations.length){const d=destinations[step];mctx.fillStyle='#d8ff58';mctx.beginPath();mctx.arc(d.x*sx,d.y*sy,3.8,0,Math.PI*2);mctx.fill()}
    mctx.fillStyle='#e2c76a';for(const stash of stashes)if(!stash.collected){mctx.beginPath();mctx.arc(stash.x*sx,stash.y*sy,2.1,0,Math.PI*2);mctx.fill()}
    mctx.save();mctx.translate((inCar?car.x:player.x)*sx,(inCar?car.y:player.y)*sy);mctx.rotate(inCar?car.angle:player.angle);mctx.fillStyle='#fff';mctx.beginPath();mctx.moveTo(5,0);mctx.lineTo(-4,-3);mctx.lineTo(-3,3);mctx.closePath();mctx.fill();mctx.restore();
    mctx.strokeStyle='rgba(255,255,255,.2)';mctx.lineWidth=1;mctx.strokeRect(0,0,w,h);
  }
  function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
  function showToast(text){const el=$('toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2500)}
  function updateHUD(){const target=destinations[step];if(target){const d=dist(inCar?car:player,target);$('distance').textContent=Math.round(d)+' M';$('objective-text').textContent=step===0?'Find the yellow marker':step===1?'Deliver the package': 'Make the final drop';$('progress-text').textContent=`${step} / 3`;$('progress-fill').style.width=`${Math.min(100,step/3*100)}%`}else{$('distance').textContent='DONE';$('objective-text').textContent='Job complete — enjoy the city';$('progress-text').textContent='3 / 3';$('progress-fill').style.width='100%'}
    $('cash').textContent=cash.toLocaleString();$('stash-count').textContent=`${stashesCollected} / ${stashes.length}`;$('nitro-fill').style.width=nitro+'%';$('heat-word').textContent=heat?'WANTED':'CLEAR';$('heat-caption').textContent=heat?'Keep moving, lose the tail':'Keep a low profile';$('heat-stars').querySelectorAll('i').forEach((s,i)=>s.style.color=i<heat?'#ffcd56':'#536052');
    const hud=$('vehicle-hud');hud.classList.toggle('active',inCar);if(inCar){$('vehicle-name').textContent=car.name;$('speed').textContent=String(Math.round(Math.abs(car.speed)*.72)).padStart(3,'0');$('fuel-fill').style.width=(car.fuel||86)+'%'}
  }
  function completeJob(){if(step>=destinations.length)return;step++;cash+=step===1?700:step===2?1100:1800;if(step>=destinations.length){showToast('JOB COMPLETE  ·  $3,600 earned  ·  San Paloma is yours');$('mission-copy').textContent='Clean work. The city is yours.';heat=0}else{showToast(['','Package secured. Head to the marina.','Drop made. One last stop in Old Town.'][step]);$('mission-copy').textContent=step===1?'Package secured. Deliver it to the marina.':'First drop complete. One last stop.'}updateHUD()}
  function enterExit(){if(!started)return;if(inCar){car.occupied=false;player.x=car.x+Math.cos(car.angle+Math.PI/2)*25;player.y=car.y+Math.sin(car.angle+Math.PI/2)*25;player.angle=car.angle;car.speed=0;inCar=false;showToast('On foot. Press E near a vehicle to get in.')}else{let nearest=null,dd=48;for(const c of parked){const d=dist(player,c);if(d<dd){nearest=c;dd=d}}if(nearest){car=nearest;car.occupied=true;inCar=true;showToast('Vehicle acquired: '+car.name+'  ·  Drive safe-ish')}else showToast('Get closer to a parked vehicle to enter.')}updateHUD()}
  function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
  function updateWorld(dt){if(started&&!paused){worldMinutes=(worldMinutes+dt*.6)%(24*60);weatherElapsed+=dt;if(weatherElapsed>=120){weatherElapsed=0;weatherIndex=(weatherIndex+1)%weatherKinds.length;showToast('Weather update: '+weatherKinds[weatherIndex].toLowerCase()+'. Drive carefully.')}}
    const hour=worldMinutes/60,daylight=clamp(Math.sin((hour-6)/14*Math.PI),0,1),weather=weatherKinds[weatherIndex],rainy=weather==='RAIN',misty=weather==='MIST';
    scene.background.lerpColors(nightSky,daySky,daylight);scene.fog.color.copy(scene.background);scene.fog.near=misty?20:rainy?34:58;scene.fog.far=misty?92:rainy?118:155;
    cityLights.intensity=.55+1.5*daylight;sun.intensity=(.2+2.2*daylight)*(rainy?.62:1);rainPoints.visible=rainy;
    const mins=Math.floor(worldMinutes),hh=String(Math.floor(mins/60)).padStart(2,'0'),mm=String(mins%60).padStart(2,'0');$('city-clock').textContent=hh+':'+mm;$('weather-label').textContent=weather;
    if(rainy){const focus=inCar?car:player,p=to3(focus.x,focus.y);rainPoints.position.set(p.x,0,p.z);for(let i=0;i<rainCount;i++){let j=i*3;rainPositions[j+1]-=rainSpeeds[i]*dt;if(rainPositions[j+1]<0){rainPositions[j]=(Math.random()-.5)*28;rainPositions[j+1]=14+Math.random()*4;rainPositions[j+2]=(Math.random()-.5)*28}}rainGeometry.attributes.position.needsUpdate=true}
  }
  function updateStashes(){if(!started||paused)return;const focus=inCar?car:player;for(const stash of stashes){if(!stash.collected&&dist(focus,stash)<27){stash.collected=true;stashesCollected++;cash+=250;showToast('City stash found  ·  $250 added to your wallet');updateHUD()}}}
  function update(dt){if(!started||paused)return;let ax=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),ay=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);
    if(inCar){const accelerating=keys.w||keys.arrowup,braking=keys.s||keys.arrowdown,steering=keys.a||keys.arrowleft? -1:keys.d||keys.arrowright?1:0,boosting=!!keys.shift&&nitro>0;nitro=clamp(nitro+(boosting?-32:12)*dt,0,100);car.speed+=(accelerating?(boosting?175:105):0)-(braking?135:0)-car.speed*1.05;car.speed=clamp(car.speed,-58,boosting?210:150);car.angle+=steering*dt*(.9+Math.min(1,Math.abs(car.speed)/60))*(car.speed<0?-1:1);let nx=car.x+Math.cos(car.angle)*car.speed*dt,ny=car.y+Math.sin(car.angle)*car.speed*dt;if(nx>8&&ny>8&&nx<WORLD.w-8&&ny<WORLD.h-8){car.x=nx;car.y=ny}if(!isRoad(car.x,car.y)){car.speed*=.96}if(Math.abs(car.speed)>90&&Math.random()<dt*.018){heat=Math.min(3,heat+1);updateHUD()}}
    else{const mag=Math.hypot(ax,ay);if(mag){ax/=mag;ay/=mag;const boost=keys.shift?1.55:1, speed=132*boost;player.x=clamp(player.x+ax*speed*dt,8,WORLD.w-8);player.y=clamp(player.y+ay*speed*dt,8,WORLD.h-8);player.angle=Math.atan2(ay,ax);player.walk+=dt*13}}
    if(gameMode==='local'){let bx=(keys.l?1:0)-(keys.j?1:0),by=(keys.k?1:0)-(keys.i?1:0),bm=Math.hypot(bx,by);if(bm){bx/=bm;by/=bm;secondPlayer.x=clamp(secondPlayer.x+bx*132*dt,8,WORLD.w-8);secondPlayer.y=clamp(secondPlayer.y+by*132*dt,8,WORLD.h-8);secondPlayer.angle=Math.atan2(by,bx)}}
    if(gameMode==='online'&&dataChannel&&dataChannel.readyState==='open'&&performance.now()-lastSync>80){lastSync=performance.now();dataChannel.send(JSON.stringify({x:player.x,y:player.y,a:player.angle}))}
    for(const t of traffic){t.phase+=dt*1.7;let nx=t.x+(t.axis==='x'?t.dir*t.speed*dt:0),ny=t.y+(t.axis==='y'?t.dir*t.speed*dt:0);if(nx<50||nx>WORLD.w-50)t.dir*=-1;if(ny<50||ny>WORLD.h-50)t.dir*=-1;t.x=clamp(nx,50,WORLD.w-50);t.y=clamp(ny,50,WORLD.h-50)}
    let focus=inCar?car:player;if(gameMode==='local')focus={x:(focus.x+secondPlayer.x)/2,y:(focus.y+secondPlayer.y)/2};camera.x=clamp(focus.x-W/2,0,Math.max(0,WORLD.w-W));camera.y=clamp(focus.y-H/2,0,Math.max(0,WORLD.h-H));
    if((gameMode==='story'||gameMode==='local'||gameMode==='online')&&step<destinations.length&&(dist(inCar?car:player,destinations[step])<48||(gameMode==='local'&&dist(secondPlayer,destinations[step])<48)))completeJob();updateHUD();
  }
  function render(dt){sync3D(dt);renderer.render(scene,camera3d);drawMinimap();}
  function loop(now){let dt=Math.min(.04,(now-last)/1000||0);last=now;updateWorld(dt);update(dt);updateStashes();render(dt);requestAnimationFrame(loop)}requestAnimationFrame(loop);
  window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();keys[k]=true;if(k==='e'&&!e.repeat)enterExit();if(k==='escape'&&started){paused=!paused;$('pause-badge').classList.toggle('active',paused)}});
  window.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);window.addEventListener('blur',()=>Object.keys(keys).forEach(k=>keys[k]=false));
  function startGame(mode){gameMode=mode;started=true;paused=false;$('game-shell').classList.remove('menu-open');$('overlay').classList.add('hidden');$('pause-badge').classList.remove('active');$('mobile-controls').classList.toggle('active',innerWidth<700);$('mission-card').classList.toggle('mode-hidden',mode==='roam');$('mission-copy').textContent=mode==='roam'?'No jobs, no pressure. Explore San Paloma.':'Pick up the package. Keep it clean.';$('controls-hint').innerHTML=mode==='local'?'<span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> PLAYER 1</span><i></i><span><kbd>I</kbd><kbd>J</kbd><kbd>K</kbd><kbd>L</kbd> PLAYER 2</span><i></i><span><kbd>E</kbd> VEHICLE</span>':'<span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> MOVE</span><i></i><span><kbd>E</kbd> ENTER / EXIT</span><i></i><span><kbd>SHIFT</kbd> SPRINT</span>';if(mode==='roam')showToast('Free roam: explore, drive, and make your own fun.');else if(mode==='local')showToast('Player 1: WASD · Player 2: IJKL · E to enter / exit');else if(mode==='online')showToast('Online link connected. Explore San Paloma together.');else showToast('Welcome to San Paloma. Follow the marker to start the job.');updateHUD()}
  document.querySelectorAll('.mode-option').forEach(button=>button.addEventListener('click',()=>{selectedMode=button.dataset.mode;document.querySelectorAll('.mode-option').forEach(item=>item.classList.toggle('selected',item===button));$('online-panel').hidden=selectedMode!=='online';$('start-button').innerHTML=selectedMode==='story'?'START STORY <span>↗</span>':selectedMode==='roam'?'ENTER FREE ROAM <span>↗</span>':selectedMode==='local'?'START LOCAL CO-OP <span>↗</span>':'START ONLINE LINK <span>↗</span>'}));
  $('start-button').addEventListener('click',()=>{if(selectedMode!=='online')startGame(selectedMode);else if(dataChannel&&dataChannel.readyState==='open')startGame('online');else $('online-status').textContent='First create or join an invite and connect both players.'});
  function waitForIce(pc){return new Promise(resolve=>{if(pc.iceGatheringState==='complete')return resolve();const done=()=>{if(pc.iceGatheringState==='complete'){pc.removeEventListener('icegatheringstatechange',done);resolve()}};pc.addEventListener('icegatheringstatechange',done);setTimeout(resolve,8000)})}
  function setupPeer(){if(peer)peer.close();peer=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});peer.ondatachannel=e=>attachChannel(e.channel);peer.onconnectionstatechange=()=>{if(peer.connectionState==='failed'||peer.connectionState==='disconnected')$('online-status').textContent='Connection lost. Try making a fresh invite.'};return peer}
  function attachChannel(channel){dataChannel=channel;channel.onopen=()=>{$('online-status').textContent='Connected! Starting the shared city…';remotePlayer.connected=true;startGame('online')};channel.onclose=()=>{remotePlayer.connected=false};channel.onmessage=e=>{try{const d=JSON.parse(e.data);if(Number.isFinite(d.x)&&Number.isFinite(d.y)&&Number.isFinite(d.a)){remotePlayer.x=clamp(d.x,0,WORLD.w);remotePlayer.y=clamp(d.y,0,WORLD.h);remotePlayer.angle=d.a;remotePlayer.connected=true}}catch(_){}}}
  $('host-online').addEventListener('click',async()=>{try{$('online-status').textContent='Building invite…';$('signal-label').textContent='Copy this invite and send it to your friend. When they return an answer, paste it below.';const pc=setupPeer();attachChannel(pc.createDataChannel('wgf-player'));await pc.setLocalDescription(await pc.createOffer());await waitForIce(pc);$('signal-box').value=JSON.stringify(pc.localDescription);$('online-status').textContent='Invite ready. Send it to your friend.'}catch(e){$('online-status').textContent='Could not create invite: '+e.message}});
  $('join-online').addEventListener('click',async()=>{try{$('online-status').textContent='Paste the host invite in the box, then press PASTE / CONNECT.';$('signal-label').textContent='Paste your friend’s invite below. Your answer will appear here to send back.';$('signal-box').value='';$('signal-box').focus()}catch(e){$('online-status').textContent=e.message}});
  $('apply-signal').addEventListener('click',async()=>{try{const description=JSON.parse($('signal-box').value),pc=description.type==='answer'&&peer?peer:setupPeer();if(description.type==='offer'){await pc.setRemoteDescription(description);await pc.setLocalDescription(await pc.createAnswer());await waitForIce(pc);$('signal-box').value=JSON.stringify(pc.localDescription);$('online-status').textContent='Answer ready. Send it to the host; connection starts when they paste it.'}else if(description.type==='answer'){await pc.setRemoteDescription(description);$('online-status').textContent='Answer received. Connecting…'}else throw new Error('That text is not a valid invite or answer.')}catch(e){$('online-status').textContent='Could not connect: '+e.message}});
  $('copy-signal').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('signal-box').value);$('online-status').textContent='Copied. Send it to your friend.'}catch(_){$('signal-box').select();document.execCommand('copy');$('online-status').textContent='Copied. Send it to your friend.'}});
  $('sound-toggle').addEventListener('click',()=>{muted=!muted;$('sound-toggle').innerHTML=muted?'× <span>SOUND OFF</span>':'♫ <span>SOUND</span>';showToast(muted?'Sound effects off':'Sound effects on')});
  document.querySelectorAll('.dpad button').forEach(btn=>{const k=btn.dataset.key;btn.addEventListener('pointerdown',e=>{e.preventDefault();keys[k]=true});['pointerup','pointercancel','pointerleave'].forEach(ev=>btn.addEventListener(ev,()=>keys[k]=false))});
  $('mobile-enter').addEventListener('pointerdown',e=>{e.preventDefault();enterExit()});$('mobile-sprint').addEventListener('pointerdown',e=>{e.preventDefault();keys.shift=true});$('mobile-sprint').addEventListener('pointerup',()=>keys.shift=false);$('mobile-sprint').addEventListener('pointercancel',()=>keys.shift=false);
  updateHUD();
})();
