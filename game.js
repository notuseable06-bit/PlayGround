(() => {
  'use strict';
  const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
  const mini = document.getElementById('minimap'), mctx = mini.getContext('2d');
  const $ = id => document.getElementById(id);
  const WORLD = { w: 2600, h: 1900 }, roadW = 112, blockW = 300, stride = blockW + roadW;
  let W = 0, H = 0, dpr = 1, started = false, paused = false, inCar = false, car = null, cash = 2450, step = 0, heat = 0, muted = false, last = 0, toastTimer = 0;
  const keys = Object.create(null), camera = {x: 0, y: 0};
  const player = {x: 620, y: 520, angle: -Math.PI / 2, speed: 0, walk: 0};
  const destinations = [{x: 878,y: 468,label:'PACKAGE PICKUP',name:'Market Street'}, {x:1900,y:1236,label:'FIRST DROP',name:'Marina Vista'}, {x:520,y:1510,label:'FINAL DELIVERY',name:'Old Town'}];
  const blocks = [], trees = [], traffic = [], parked = [];
  const palette = ['#d5c6a9','#c9d0c0','#d3c9b5','#b8c5b6','#d9d4c6','#b9c9c4','#d4c4ae'];
  function resize(){dpr=Math.min(window.devicePixelRatio||1,2);W=innerWidth;H=innerHeight;canvas.width=Math.floor(W*dpr);canvas.height=Math.floor(H*dpr);canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.setTransform(dpr,0,0,dpr,0,0)}
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
  for(let i=0;i<18;i++) {let x=235+(i*197)%2200, y=182+(i*283)%1600;if(isRoad(x,y)&&Math.random()>.35)parked.push({x,y,angle:((i%2)?0:Math.PI/2),color:['#bd6648','#d1d1c5','#457e83','#c4a34d','#4e5960'][i%5],name:['Vesper Coupe','Cobalt Sedan','Sunliner','Mesa Classic','Harbor Compact'][i%5],occupied:false});}
  for(let i=0;i<12;i++)traffic.push({x:150+(i*223)%2300,y:166+(i*191)%1650,axis:i%2?'x':'y',dir:i%3===0?-1:1,speed:30+(i*7)%25,color:['#758376','#a76f58','#d0b886','#6a7b86'][i%4],phase:i*3});
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
    const x=inCar?car.x:player.x,y=inCar?car.y:player.y,a=inCar?car.angle:player.angle,p=screen(x,y);
    if(inCar)drawCar(x,y,a,car.color,true);else{ctx.save();ctx.translate(p.x,p.y);ctx.rotate(a);ctx.fillStyle='rgba(20,29,23,.35)';ctx.beginPath();ctx.ellipse(2,5,8,5,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d8a675';ctx.beginPath();ctx.arc(0,-2,5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#263a33';rounded(-4,1,8,10,3);ctx.fillStyle='#e7d4a9';ctx.fillRect(-5,3,3,4);ctx.fillRect(2,3,3,4);ctx.restore()}
  }
  function drawMinimap(){const w=180,h=180;mctx.clearRect(0,0,w,h);mctx.fillStyle='#26332d';mctx.fillRect(0,0,w,h);let sx=w/WORLD.w,sy=h/WORLD.h;
    mctx.fillStyle='#777f75';for(let x=0;x<WORLD.w;x+=stride)mctx.fillRect(x*sx,0,roadW*sx,h);for(let y=0;y<WORLD.h;y+=stride)mctx.fillRect(0,y*sy,w,roadW*sy);
    mctx.fillStyle='#839b78';for(const b of blocks)if(b.park)mctx.fillRect(b.x*sx,b.y*sy,b.w*sx,b.h*sy);
    if(step<destinations.length){const d=destinations[step];mctx.fillStyle='#d8ff58';mctx.beginPath();mctx.arc(d.x*sx,d.y*sy,3.8,0,Math.PI*2);mctx.fill()}
    mctx.save();mctx.translate((inCar?car.x:player.x)*sx,(inCar?car.y:player.y)*sy);mctx.rotate(inCar?car.angle:player.angle);mctx.fillStyle='#fff';mctx.beginPath();mctx.moveTo(5,0);mctx.lineTo(-4,-3);mctx.lineTo(-3,3);mctx.closePath();mctx.fill();mctx.restore();
    mctx.strokeStyle='rgba(255,255,255,.2)';mctx.lineWidth=1;mctx.strokeRect(0,0,w,h);
  }
  function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
  function showToast(text){const el=$('toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2500)}
  function updateHUD(){const target=destinations[step];if(target){const d=dist(inCar?car:player,target);$('distance').textContent=Math.round(d)+' M';$('objective-text').textContent=step===0?'Find the yellow marker':step===1?'Deliver the package': 'Make the final drop';$('progress-text').textContent=`${step} / 3`;$('progress-fill').style.width=`${Math.min(100,step/3*100)}%`}else{$('distance').textContent='DONE';$('objective-text').textContent='Job complete — enjoy the city';$('progress-text').textContent='3 / 3';$('progress-fill').style.width='100%'}
    $('cash').textContent=cash.toLocaleString();$('heat-word').textContent=heat?'WANTED':'CLEAR';$('heat-caption').textContent=heat?'Keep moving, lose the tail':'Keep a low profile';$('heat-stars').querySelectorAll('i').forEach((s,i)=>s.style.color=i<heat?'#ffcd56':'#536052');
    const hud=$('vehicle-hud');hud.classList.toggle('active',inCar);if(inCar){$('vehicle-name').textContent=car.name;$('speed').textContent=String(Math.round(Math.abs(car.speed)*.72)).padStart(3,'0');$('fuel-fill').style.width=(car.fuel||86)+'%'}
  }
  function completeJob(){if(step>=destinations.length)return;step++;cash+=step===1?700:step===2?1100:1800;if(step>=destinations.length){showToast('JOB COMPLETE  ·  $3,600 earned  ·  San Paloma is yours');$('mission-copy').textContent='Clean work. The city is yours.';heat=0}else{showToast(['','Package secured. Head to the marina.','Drop made. One last stop in Old Town.'][step]);$('mission-copy').textContent=step===1?'Package secured. Deliver it to the marina.':'First drop complete. One last stop.'}updateHUD()}
  function enterExit(){if(!started)return;if(inCar){car.occupied=false;player.x=car.x+Math.cos(car.angle+Math.PI/2)*25;player.y=car.y+Math.sin(car.angle+Math.PI/2)*25;player.angle=car.angle;car.speed=0;inCar=false;showToast('On foot. Press E near a vehicle to get in.')}else{let nearest=null,dd=48;for(const c of parked){const d=dist(player,c);if(d<dd){nearest=c;dd=d}}if(nearest){car=nearest;car.occupied=true;inCar=true;showToast('Vehicle acquired: '+car.name+'  ·  Drive safe-ish')}else showToast('Get closer to a parked vehicle to enter.')}updateHUD()}
  function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
  function update(dt){if(!started||paused)return;let ax=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),ay=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);
    if(inCar){const accelerating=keys.w||keys.arrowup,braking=keys.s||keys.arrowdown,steering=keys.a||keys.arrowleft? -1:keys.d||keys.arrowright?1:0;car.speed+=(accelerating?105:0)-(braking?135:0)-car.speed*1.05;car.speed=clamp(car.speed,-58,150);car.angle+=steering*dt*(.9+Math.min(1,Math.abs(car.speed)/60))*(car.speed<0?-1:1);let nx=car.x+Math.cos(car.angle)*car.speed*dt,ny=car.y+Math.sin(car.angle)*car.speed*dt;if(nx>8&&ny>8&&nx<WORLD.w-8&&ny<WORLD.h-8){car.x=nx;car.y=ny}if(!isRoad(car.x,car.y)){car.speed*=.96}if(Math.abs(car.speed)>90&&Math.random()<dt*.018){heat=Math.min(3,heat+1);updateHUD()}}
    else{const mag=Math.hypot(ax,ay);if(mag){ax/=mag;ay/=mag;const boost=keys.shift?1.55:1, speed=132*boost;player.x=clamp(player.x+ax*speed*dt,8,WORLD.w-8);player.y=clamp(player.y+ay*speed*dt,8,WORLD.h-8);player.angle=Math.atan2(ay,ax);player.walk+=dt*13}}
    for(const t of traffic){t.phase+=dt*1.7;let nx=t.x+(t.axis==='x'?t.dir*t.speed*dt:0),ny=t.y+(t.axis==='y'?t.dir*t.speed*dt:0);if(nx<50||nx>WORLD.w-50)t.dir*=-1;if(ny<50||ny>WORLD.h-50)t.dir*=-1;t.x=clamp(nx,50,WORLD.w-50);t.y=clamp(ny,50,WORLD.h-50)}
    const focus=inCar?car:player;camera.x=clamp(focus.x-W/2,0,Math.max(0,WORLD.w-W));camera.y=clamp(focus.y-H/2,0,Math.max(0,WORLD.h-H));
    if(step<destinations.length&&dist(focus,destinations[step])<48)completeJob();updateHUD();
  }
  function render(){ctx.clearRect(0,0,W,H);drawGround();drawBuildings();drawWorldObjects();drawMinimap();}
  function loop(now){let dt=Math.min(.04,(now-last)/1000||0);last=now;update(dt);render();requestAnimationFrame(loop)}requestAnimationFrame(loop);
  window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();keys[k]=true;if(k==='e'&&!e.repeat)enterExit();if(k==='escape'&&started){paused=!paused;$('pause-badge').classList.toggle('active',paused)}});
  window.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);window.addEventListener('blur',()=>Object.keys(keys).forEach(k=>keys[k]=false));
  $('start-button').addEventListener('click',()=>{started=true;$('overlay').classList.add('hidden');$('mobile-controls').classList.toggle('active',innerWidth<700);showToast('Welcome to San Paloma. Follow the marker to start the job.');updateHUD()});
  $('sound-toggle').addEventListener('click',()=>{muted=!muted;$('sound-toggle').innerHTML=muted?'× <span>SOUND OFF</span>':'♫ <span>SOUND</span>';showToast(muted?'Sound effects off':'Sound effects on')});
  document.querySelectorAll('.dpad button').forEach(btn=>{const k=btn.dataset.key;btn.addEventListener('pointerdown',e=>{e.preventDefault();keys[k]=true});['pointerup','pointercancel','pointerleave'].forEach(ev=>btn.addEventListener(ev,()=>keys[k]=false))});
  $('mobile-enter').addEventListener('pointerdown',e=>{e.preventDefault();enterExit()});$('mobile-sprint').addEventListener('pointerdown',e=>{e.preventDefault();keys.shift=true});$('mobile-sprint').addEventListener('pointerup',()=>keys.shift=false);$('mobile-sprint').addEventListener('pointercancel',()=>keys.shift=false);
  updateHUD();
})();
