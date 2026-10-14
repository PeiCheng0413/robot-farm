const $=s=>document.querySelector(s);
const stages=['幼苗','幼株','成長','成熟'], actions=['漂浮待命','播種','澆水','採收'];
const produce={
  1:{name:'胡蘿蔔',file:'assets/produce-carrot-v01.png',bounds:[393,275,632,778]},
  2:{name:'番茄',file:'assets/produce-tomato-v01.png',bounds:[400,421,454,448]},
  3:{name:'萵苣',file:'assets/produce-lettuce-v01.png',bounds:[268,355,724,643]}
};
const plots=Array.from({length:6},(_,i)=>({crop:i%3+1,stage:i<3?3:i-3,soil:2}));
let selected=0,action=0,frame=0,paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
// 僅一個攜帶槽；採收期間先保留槽位，防止快速重按或換田重複拿取。
let cargo=null,harvestTarget=null;
const robotCuts=[[0,327,630,936,1254],[0,329,659,970,1254],[0,336,660,986,1254]];
const robotSource=new Image(),harvestSource=new Image(),directionSource=new Image(),robotViews=new Set();
let heading=0,directionalPose=false,movement=null;
const directions=[{name:"南 ↓",dx:0,dy:1},{name:"西 ←",dx:-1,dy:0},{name:"北 ↑",dx:0,dy:-1},{name:"東 →",dx:1,dy:0}];
function drawRobot(el){
  const canvas=el.firstElementChild,ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,384,340);ctx.imageSmoothingEnabled=false;
  const {col,row}=el.robotFrame;
  if(row===0||row>=4){
    if(!directionSource.complete||!directionSource.naturalWidth)return;
    const direction=row===0?0:row-4;
    // 逐列透明間隙切格，保留第一列超過名義格線的推進器。
    const ys=[0,331,625,910,1254],xs=[0,314,627,941,1254];
    const x=xs[col],y=ys[direction],w=xs[col+1]-x,h=ys[direction+1]-y;
    ctx.drawImage(directionSource,x,y,w,h,16,13+y-Math.round(direction*313.5),w,h);
    return;
  }
  if(row===3){
    if(!harvestSource.complete||!harvestSource.naturalWidth)return;
    const size=harvestSource.naturalWidth/2;
    // 新圖集只有空手動作；作物絕不畫進機器人的畫布。
    ctx.drawImage(harvestSource,(col%2)*size,Math.floor(col/2)*size,size,size,16,13,313.5,313.5);
    return;
  }
  if(!robotSource.complete||!robotSource.naturalWidth)return;
  const x=robotCuts[row][col],right=robotCuts[row][col+1];
  const y=Math.round(row*313.5),bottom=Math.round((row+1)*313.5);
  ctx.drawImage(robotSource,x,y,right-x,bottom-y,x-Math.round(col*313.5)+16,13,right-x,bottom-y);
}
function position(el,col,row){
  if(!el.classList.contains('robot')){el.style.backgroundPosition=`${col*100/3}% ${row*100/3}%`;return;}
  if(!el.firstElementChild){const canvas=document.createElement('canvas');canvas.width=384;canvas.height=340;canvas.setAttribute('aria-hidden','true');el.append(canvas);robotViews.add(el);}
  el.robotFrame={col,row};drawRobot(el);
}
for(const source of [robotSource,harvestSource,directionSource]){
  source.onload=()=>robotViews.forEach(drawRobot);
  source.onerror=()=>{$('#status').textContent='機器人素材載入失敗，請重新整理頁面。';};
}
robotSource.src='assets/robot-atlas-v01.png';harvestSource.src='assets/robot-harvest-empty-v02.png';directionSource.src='assets/robot-hover-directions-v04.png';
// 商店與頭頂持物共用來源圖和裁取範圍，僅顯示尺寸不同。
const itemViews=new Set();
function drawItem(canvas){
  const item=produce[canvas.crop],ctx=canvas.getContext('2d');ctx.clearRect(0,0,96,96);
  if(!item.image.complete||!item.image.naturalWidth)return;
  const [x,y,w,h]=item.bounds,scale=80/Math.max(w,h);
  ctx.imageSmoothingEnabled=false;ctx.drawImage(item.image,x,y,w,h,(96-w*scale)/2,88-h*scale,w*scale,h*scale);
}
function itemCanvas(crop){const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;canvas.crop=crop;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',produce[crop].name);canvas.className='produce-image';itemViews.add(canvas);drawItem(canvas);return canvas;}
Object.values(produce).forEach(item=>{item.image=new Image();item.image.onload=()=>itemViews.forEach(drawItem);item.image.src=item.file;});
function buttons(id,value){document.querySelectorAll(`${id} button`).forEach(b=>{b.classList.toggle('active',+b.dataset.value===value);b.setAttribute('aria-pressed',String(+b.dataset.value===value));});}
function renderPlots(){
  $('#plots').innerHTML='';
  plots.forEach((p,i)=>{
    const lifted=cargo&&cargo.plot===i;
    const b=document.createElement('button');b.className='plot'+(selected===i?' selected':'');
    b.setAttribute('aria-label',`田區 ${i+1}，${produce[p.crop].name}，${lifted?'已拿起':stages[p.stage]}`);b.setAttribute('aria-pressed',String(selected===i));
    b.innerHTML='<div class="sprite farm soil"></div><div class="sprite farm plant"></div>';
    position(b.children[0],p.soil,0);position(b.children[1],p.stage,p.crop);b.children[1].hidden=!!lifted;
    b.onclick=()=>{
      if(harvestTarget){$('#status').textContent='正在拿起作物，完成後即可移動。';return;}
      moveTo(i);
    };$('#plots').append(b);
  });
}
function sync(){
  const p=plots[selected],locked=!!harvestTarget||!!(cargo&&cargo.plot===selected);
  $('#crop').value=p.crop;$('#growth').value=p.stage;$('#stage-name').textContent=stages[p.stage];buttons('#soils',p.soil);
  $('#crop').disabled=locked;$('#growth').disabled=locked;
  $('#drop').disabled=!cargo||!!harvestTarget||!!movement;
  $('#heading').textContent=`移動朝向：${directions[heading].name}`;
  $('#cargo-status').textContent=cargo?`${produce[cargo.crop].name} × 1 ／ 1`:(harvestTarget?'正在拿起…':'空手 ／ 最多 1 個');
}
function showCargo(){
  const holder=$('#held-item');
  if(!cargo){holder.hidden=true;for(const c of holder.children)itemViews.delete(c);holder.replaceChildren();return;}
  if(!holder.firstElementChild||holder.firstElementChild.crop!==cargo.crop){for(const c of holder.children)itemViews.delete(c);holder.replaceChildren(itemCanvas(cargo.crop));}
  holder.hidden=false;holder.classList.toggle('lifting',!!harvestTarget&&frame<3);
}
$('#actions').onclick=e=>{
  if(!e.target.matches('button'))return;
  const next=+e.target.dataset.value;
  if(movement){$('#status').textContent='移動完成後即可切換動作。';return;}
  if(harvestTarget){$('#status').textContent=paused?'採收已暫停，請先播放動畫。':'正在採收，一次只能拿起一個作物。';return;}
  if(cargo){
    if(next===0){directionalPose=false;position($('#robot'),3,3);}
    $('#status').textContent=next===0?`正舉著 1 個${produce[cargo.crop].name}，可點田區移動。`:'一次只能拿一個，請先放下頭上的作物。';
    return;
  }
  directionalPose=false;action=next;frame=0;
  if(action===3){harvestTarget={plot:selected,crop:plots[selected].crop};$('#status').textContent=paused?'採收已就緒，按「播放動畫」開始。':`正在拿起${produce[harvestTarget.crop].name}…`;}
  else $('#status').textContent=`小機器人正在${actions[action]}${action?'（動作循環預覽）':''}`;
  buttons('#actions',action);position($('#robot'),frame,action);sync();
};
$('#drop').onclick=()=>{
  if(!cargo||harvestTarget||movement)return;
  directionalPose=false;
  const name=produce[cargo.crop].name;cargo=null;action=0;frame=0;showCargo();renderPlots();sync();buttons('#actions',0);position($('#robot'),0,0);
  $('#status').textContent=`已放下${name}，原田區恢復展示，可再次採收。`;
};
$('#soils').onclick=e=>{if(!e.target.matches('button'))return;plots[selected].soil=+e.target.dataset.value;renderPlots();sync();};
$('#crop').onchange=e=>{plots[selected].crop=+e.target.value;renderPlots();};
$('#growth').oninput=e=>{plots[selected].stage=+e.target.value;renderPlots();sync();};
function pauseLabel(){$('#pause').textContent=paused?'播放動畫':'暫停動畫';$('#pause').setAttribute('aria-pressed',String(paused));}
$('#pause').onclick=()=>{paused=!paused;pauseLabel();};
const rows=[['南向漂浮',0,'robot'],['播種・4 格',1,'robot'],['澆水・4 格',2,'robot'],['空手採收',3,'robot'],['西向漂浮',5,'robot'],['北向漂浮',6,'robot'],['東向漂浮',7,'robot'],['土壤狀態',0,'farm'],['胡蘿蔔',1,'farm'],['番茄',2,'farm'],['萵苣',3,'farm']];
rows.forEach(([label,row,type])=>{const r=document.createElement('div');r.className='catalog-row';const title=document.createElement('strong');title.textContent=label;r.append(title);for(let c=0;c<4;c++){const cell=document.createElement('div');cell.className='sample';const s=document.createElement('div');s.className=`sprite ${type}`;position(s,c,row);cell.append(s,document.createTextNode(type==='robot'?(row===3?['伸手','抓取','抬起','舉過頭頂'][c]:`動作 ${c+1}`):row===0?['乾裂','一般','濕潤','積水'][c]:stages[c]));r.append(cell);}$('#catalog').append(r);});
Object.entries(produce).forEach(([id,item])=>{const card=document.createElement('article');card.className='produce-card';card.append(itemCanvas(+id));const title=document.createElement('h3');title.textContent=item.name;const note=document.createElement('p');note.textContent='單個收成・攜帶與商店共用';const link=document.createElement('a');link.href=item.file;link.download='';link.textContent='下載透明素材 ↗';card.append(title,note,link);$('#produce-catalog').append(card);});
function turn(delta){
  if(movement||harvestTarget){$('#status').textContent='請等目前的移動或採收完成再轉向。';return;}
  heading=(heading+delta+4)%4;directionalPose=true;action=0;frame=0;
  buttons('#actions',0);position($('#robot'),frame,4+heading);sync();
  $('#status').textContent=`已${delta<0?'左':'右'}轉 90°，面向${directions[heading].name}。`;
}
$('#turn-left').onclick=()=>turn(-1);$('#turn-right').onclick=()=>turn(1);
$('#forward').onclick=()=>{
  if(movement||harvestTarget){$('#status').textContent='請等目前的移動或採收完成。';return;}
  const d=directions[heading],x=selected%3+d.dx,y=Math.floor(selected/3)+d.dy;
  if(x<0||x>2||y<0||y>1){$('#status').textContent='前方已到田區邊界，請先轉向。';return;}
  moveTo(y*3+x);
};
function moveTo(target){
  if(movement||harvestTarget){$('#status').textContent='請等目前的移動或採收完成。';return;}
  if(target===selected)return;
  let x=selected%3,y=Math.floor(selected/3);const tx=target%3,ty=Math.floor(target/3),route=[];
  while(x!==tx){x+=Math.sign(tx-x);route.push(y*3+x);}
  while(y!==ty){y+=Math.sign(ty-y);route.push(y*3+x);}
  movement={route,from:selected,to:null,elapsed:0};action=0;frame=0;buttons('#actions',0);startStep();
}
function startStep(){
  const to=movement.route.shift();
  if(to===undefined){movement=null;directionalPose=false;position($('#robot'),cargo?3:0,cargo?3:0);sync();$('#status').textContent=`已抵達田區 ${selected+1}${cargo?'，仍攜帶 1 個'+produce[cargo.crop].name:'，恢復正面待命'}。`;return;}
  const from=selected;movement.from=from;movement.to=to;movement.elapsed=0;
  heading=to%3<from%3?1:to%3>from%3?3:to<from?2:0;
  directionalPose=true;position($('#robot'),frame,4+heading);sync();
  $('#status').textContent=`向${directions[heading].name}移動至田區 ${to+1}${paused?'（已暫停）':''}。`;
}
let previousTime=null;
function animateMovement(time){
  const dt=previousTime===null?0:Math.min(time-previousTime,50);previousTime=time;
  if(movement&&!paused&&!document.hidden){
    const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:650;
    movement.elapsed+=dt;const progress=duration?Math.min(movement.elapsed/duration,1):1;
    const from=movement.from,to=movement.to;
    const x=from%3+(to%3-from%3)*progress,y=Math.floor(from/3)+(Math.floor(to/3)-Math.floor(from/3))*progress;
    $('#bot').style.left=`${8+x*29}%`;$('#bot').style.top=`${88+y*142}px`;
    if(progress===1){selected=to;renderPlots();startStep();}
  }
  requestAnimationFrame(animateMovement);
}
requestAnimationFrame(animateMovement);
renderPlots();sync();buttons('#actions',0);pauseLabel();position($('#robot'),0,0);
setInterval(()=>{
  if(paused||document.hidden)return;
  if(movement||directionalPose){frame=(frame+1)%4;position($('#robot'),frame,4+heading);return;}
  if(cargo&&!harvestTarget)return;
  if(harvestTarget){
    frame=Math.min(frame+1,3);
    if(frame===2&&!cargo){cargo={...harvestTarget};renderPlots();}
    if(frame===3){harvestTarget=null;$('#status').textContent=`已把 1 個${produce[cargo.crop].name}舉到頭上。放下後才能再採收。`;}
    showCargo();sync();
  }else frame=(frame+1)%4;
  position($('#robot'),frame,action);
},180);
