
(async function(){
  const response=await fetch('assets/manifest.json?v=22');
  if(!response.ok)throw new Error('素材數據讀取失敗：'+response.status);
  const manifest=await response.json(),rendering=manifest.rendering,clips=manifest.animationClips;
  const $=s=>document.querySelector(s),alignment=spriteAlignment;
  const robotViews=new Set(),plantViews=new Set(),itemViews=new Set(),soilViews=new Set(),effectViews=new Map(),images=new Map();
  const thoughts=manifest.thoughtBubbles,thoughtViews=new Map();
  const thoughtState={clip:null,elapsedMs:0,frame:null};
  const mainAssets=manifest.mainScreenAssets,mainAssetViews=new Map();
  const valley=manifest.valleyFarm;
  const boundary=manifest.landBoundary,boundaryViews=new Map();
  const valleyState={soil:valley.preview.initialSoil,view:valley.preview.initialView};
  const lookup=path=>path.reduce((value,key)=>value[key],alignment);
  const firstFrame=name=>clips[name].frameOrder[0];
  const idleAction=manifest.playback.actionClips.indexOf(manifest.playback.restClips.empty);
  const harvestAction=manifest.playback.actionClips.indexOf('harvest');
  const cropByValue=new Map(manifest.crops.map(c=>[c.labValue,c]));
  const cropById=new Map(manifest.crops.map(c=>[c.id,c]));
  const produceById=new Map(manifest.produce.map(p=>[p.id,p]));
  const actions=manifest.playback.actionLabels,stages=manifest.crops[0].stageLabels;
  const scene=rendering.scene,directions=manifest.movement.headingOrder.map(id=>manifest.movement.directionVectors.find(d=>d.id===id));
  const soilLabels=rendering.soil.labels,soilData=manifest.soilVariants;
  const plots=rendering.lab.sampleCrops.map((id,i)=>({crop:cropById.get(id).labValue,stage:rendering.lab.initialStage,soil:rendering.lab.initialSoil,variant:soilData.lab.sampleVariants[i%soilData.lab.sampleVariants.length]}));
  let selected=0,action=idleAction,frame=firstFrame(manifest.playback.restClips.empty);
  let frameCursor=0,animationTimer=null;
  let paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cargo=null,harvestTarget=null,heading=0,directionalPose=false,movement=null;

  function imageSource(file){
    if(images.has(file))return images.get(file);
    const image=new Image();images.set(file,image);
    image.onload=()=>{robotViews.forEach(drawRobot);plantViews.forEach(drawPlant);itemViews.forEach(drawItem);soilViews.forEach(drawSoil);effectViews.forEach((view,canvas)=>drawEffect(canvas,view));updateEffects();thoughtViews.forEach((index,canvas)=>drawThought(canvas,index));updateThought(true);mainAssetViews.forEach((item,canvas)=>drawMainAsset(canvas,item));drawValley();drawAngledScene();drawFarmWorld();drawAssetComparison();drawStuckPreview();angledSamples.forEach((asset,canvas)=>drawAngledSample(canvas,asset));boundaryViews.forEach((sample,canvas)=>drawBoundarySample(canvas,sample));};
    image.onerror=()=>{$('#status').textContent='素材載入失敗，請重新整理頁面。';};
    image.src='assets/'+file+'?v='+encodeURIComponent(manifest.version);
    return image;
  }
  const produce=Object.fromEntries(manifest.crops.map(c=>{
    const p=produceById.get(c.produceId);
    return [c.labValue,{name:c.name,file:'assets/'+p.file,bounds:p.sourceRect,image:imageSource(p.file)}];
  }));
  function clipName(){
    if(harvestTarget)return manifest.playback.actionClips[harvestAction];
    if(movement||directionalPose)return manifest.playback.directionalClips[cargo?'loaded':'empty'];
    if(cargo)return manifest.playback.restClips.loaded;
    return manifest.playback.actionClips[action];
  }
  function objectState(clip=clips[clipName()],index=frameCursor){
    return Object.fromEntries(Object.entries(clip.objects).map(([key,values])=>[key,values[index]]));
  }
  function resetFrame(){thoughtState.elapsedMs=0;thoughtState.frame=null;frameCursor=0;frame=firstFrame(clipName());if(animationTimer!==null)scheduleAnimation();}
  function drawRobot(el){
    const canvas=el.firstElementChild,ctx=canvas.getContext('2d'),size=alignment.canvas;
    ctx.clearRect(0,0,size,size);ctx.imageSmoothingEnabled=false;
    const {col,row}=el.robotFrame,pose=rendering.robotPoses[row];
    const sample=pose.frames[col],source=imageSource(pose.atlas);
    if(!source.complete||!source.naturalWidth)return;
    const [x,y,w,h]=sample.sourceRect,[cx,cy,height]=lookup(sample.alignmentPath);
    const scale=alignment.bodyHeight/height,[targetX,targetY]=alignment.bodyCenter;
    const bob=sample.bobIndex===null?0:alignment.bob[sample.bobIndex];
    ctx.drawImage(source,x,y,w,h,targetX+(x-cx)*scale,targetY+bob+(y-cy)*scale,w*scale,h*scale);
    const holder=el.id==='robot'?$('#held-item'):el.sampleCargo;
    if(holder){
      holder.style.width=(rendering.cargo.widthRatio*100)+'%';
      if(sample.cargoAnchorPath){
        const [hx,hy]=lookup(sample.cargoAnchorPath),baseline=rendering.produce.baseline/rendering.produce.canvas[1];
        holder.style.left=((targetX+(hx-cx)*scale)/size*100)+'%';
        holder.style.bottom=((size-(targetY+(hy-cy)*scale)-size*rendering.cargo.widthRatio*(1-baseline))/size*100)+'%';
      }else{
        const placement=objectState().cargoPose==='lifting'?rendering.cargo.lifting:rendering.cargo.fallback;
        holder.style.left=(placement.leftRatio*100)+'%';holder.style.bottom=(placement.bottomRatio*100)+'%';
      }
      holder.style.marginBottom=(-bob/size*el.clientHeight)+'px';
    }
    if(el.id==='robot')showCargo();
  }
  function drawPlant(el){
    const {col,row}=el.plantFrame,crop=cropByValue.get(row);
    const canvas=el.firstElementChild,ctx=canvas.getContext('2d'),[cw,ch]=rendering.plantCanvas;
    ctx.clearRect(0,0,cw,ch);ctx.imageSmoothingEnabled=false;
    const source=imageSource(crop.atlas),sample=crop.frames[col];
    if(!source.complete||!source.naturalWidth)return;
    const [x,y,w,h]=sample.sourceRect,[rx,ry]=sample.root,[tx,ty]=rendering.plantRoot,s=sample.scale;
    ctx.drawImage(source,x,y,w,h,tx-rx*s,ty-ry*s,w*s,h*s);
  }
  function drawSoil(el){
    const {soil,variant}=el.soilFrame,canvas=el.firstElementChild,ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,...soilData.canvas);ctx.imageSmoothingEnabled=false;
    const state=soilData.states.find(s=>s.soilIndex===soil);
    const preset=state.variants.find(v=>v.id===variant);
    for(const layer of [...preset.layers].sort((a,b)=>a.z-b.z)){
      const source=imageSource(layer.atlas);
      if(source.complete&&source.naturalWidth)ctx.drawImage(source,...layer.sourceRect,...layer.destinationRect);
    }
  }
  function position(el,col,row,variant=soilData.defaultVariant){
    if(el.classList.contains('farm')&&row>0){
      if(!el.firstElementChild){
        const canvas=document.createElement('canvas');[canvas.width,canvas.height]=rendering.plantCanvas;
        el.append(canvas);plantViews.add(el);el.classList.add('aligned-plant');
      }
      el.plantFrame={col,row};drawPlant(el);return;
    }
    if(!el.classList.contains('robot')){
      if(!el.firstElementChild){
        const canvas=document.createElement('canvas');[canvas.width,canvas.height]=soilData.canvas;
        canvas.setAttribute('aria-hidden','true');el.append(canvas);soilViews.add(el);el.classList.add('aligned-soil');
      }
      el.soilFrame={soil:col,variant};drawSoil(el);return;
    }
    if(!el.firstElementChild){
      const canvas=document.createElement('canvas');canvas.width=alignment.canvas;canvas.height=alignment.canvas;
      canvas.setAttribute('aria-hidden','true');el.append(canvas);robotViews.add(el);
    }
    el.robotFrame={col,row};drawRobot(el);
  }
  const fieldEffects=new Map();
  function drawEffect(canvas,{id,step}){
    const effect=manifest.effectClips[id],ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
    ctx.clearRect(0,0,w,h);
    const index=effect.frameIndexByStep[step];
    if(index===null||index===undefined)return;
    const source=imageSource(effect.atlas),sample=effect.frames[index];
    if(!source.complete||!source.naturalWidth)return;
    ctx.save();ctx.imageSmoothingEnabled=false;
    ctx.globalAlpha=effect.opacityByStep[step];ctx.globalCompositeOperation=effect.blendMode;
    if(effect.clipToFieldCells){
      ctx.beginPath();
      plots.forEach((p,i)=>ctx.rect(i%scene.columns*w/scene.columns,Math.floor(i/scene.columns)*h/scene.rows,w/scene.columns,h/scene.rows));
      ctx.clip();
    }
    const [rx,ry]=effect.anchor,[sw,sh]=sample.sizeRatio;
    ctx.drawImage(source,...sample.sourceRect,w*(rx-sw/2),h*(ry-sh/2),w*sw,h*sh);ctx.restore();
  }
  function updateEffects(){
    const active=clips[clipName()].effects||[],grid=$('#plots');
    fieldEffects.forEach((canvas,id)=>{
      canvas.width=Math.max(1,grid.clientWidth);canvas.height=Math.max(1,grid.clientHeight);
      canvas.style.left=grid.offsetLeft+'px';canvas.style.top=grid.offsetTop+'px';
      canvas.style.width=grid.clientWidth+'px';canvas.style.height=grid.clientHeight+'px';
      canvas.hidden=!active.includes(id);
      if(!canvas.hidden)drawEffect(canvas,{id,step:frameCursor});
    });
  }
  Object.entries(manifest.effectClips).forEach(([id,effect])=>{
    const canvas=document.createElement('canvas');canvas.className='field-effect';canvas.style.zIndex=effect.layerZ;
    canvas.setAttribute('aria-hidden','true');$('.greenhouse').append(canvas);fieldEffects.set(id,canvas);
    effect.frameIndexByStep.forEach((index,step)=>{
      if(index===null)return;
      const card=document.createElement('figure'),sample=document.createElement('canvas');sample.width=320;sample.height=200;
      sample.className='scan-wave-sample';sample.setAttribute('role','img');sample.setAttribute('aria-label','掃描波紋 '+(index+1));
      const view={id,step};effectViews.set(sample,view);drawEffect(sample,view);
      const caption=document.createElement('figcaption');caption.textContent='波紋 '+(index+1);card.append(sample,caption);$('#scan-wave-samples').append(card);
    });
  });
  const thoughtCanvas=document.createElement('canvas');[thoughtCanvas.width,thoughtCanvas.height]=thoughts.canvas;
  thoughtCanvas.className='thought-bubble';thoughtCanvas.hidden=true;thoughtCanvas.setAttribute('role','img');$('#bot').append(thoughtCanvas);
  function drawThought(canvas,index){
    const ctx=canvas.getContext('2d'),sample=thoughts.frames[index],source=imageSource(thoughts.atlas);
    ctx.clearRect(0,0,...thoughts.canvas);ctx.imageSmoothingEnabled=false;
    if(source.complete&&source.naturalWidth)ctx.drawImage(source,...sample.sourceRect,...sample.destinationRect);
  }
  function thoughtFrame(name,elapsedMs){
    const animation=thoughts.animations[name],total=animation.frameDurationsMs.reduce((sum,ms)=>sum+ms,0);
    let time=animation.loop?elapsedMs%total:Math.min(elapsedMs,total);
    for(let i=0;i<animation.frameOrder.length;i++){
      if(time<animation.frameDurationsMs[i])return animation.frameOrder[i];time-=animation.frameDurationsMs[i];
    }
    return animation.frameOrder[animation.frameOrder.length-1];
  }
  function updateThought(force=false){
    const current=clipName();
    if(thoughtState.clip!==current){thoughtState.clip=current;thoughtState.elapsedMs=0;thoughtState.frame=null;}
    const name=thoughts.byClip[current];thoughtCanvas.hidden=!name;
    if(!name)return;
    const p=thoughts.placement,pose=$('#robot').robotFrame,sample=rendering.robotPoses[pose.row].frames[pose.col];
    thoughtCanvas.style.left=(p.leftRatio*100)+'%';thoughtCanvas.style.bottom=(p.bottomRatio*100)+'%';
    thoughtCanvas.style.width=(p.widthRatio*100)+'%';thoughtCanvas.style.zIndex=p.layerZ;
    const bob=p.followPoseBob&&sample.bobIndex!==null?alignment.bob[sample.bobIndex]:0;
    thoughtCanvas.style.marginBottom=(-bob/alignment.canvas*$('#robot').clientHeight)+'px';
    thoughtCanvas.setAttribute('aria-label',actions[manifest.playback.actionClips.indexOf(current)]+'的想法泡泡');
    const index=thoughtFrame(name,thoughtState.elapsedMs);
    if(force||thoughtState.frame!==index){drawThought(thoughtCanvas,index);thoughtState.frame=index;}
  }
  thoughts.frames.forEach((sample,index)=>{
    const card=document.createElement('figure'),canvas=document.createElement('canvas');[canvas.width,canvas.height]=thoughts.canvas;
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label',sample.label);canvas.className='thought-sample';
    thoughtViews.set(canvas,index);drawThought(canvas,index);
    const caption=document.createElement('figcaption');caption.textContent=sample.label;card.append(canvas,caption);$('#thought-samples').append(card);
  });
  function updateRobot(){
    const clip=clips[clipName()],row=clip.poseRows[clip.poseRows.length>1?heading:0];
    position($('#robot'),frame,row);updateEffects();updateThought();
  }
  function drawItem(canvas){
    const item=produce[canvas.crop],ctx=canvas.getContext('2d'),data=rendering.produce,[cw,ch]=data.canvas;
    ctx.clearRect(0,0,cw,ch);
    if(!item.image.complete||!item.image.naturalWidth)return;
    const [x,y,w,h]=item.bounds,scale=data.maxContentSize/Math.max(w,h);
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(item.image,x,y,w,h,(cw-w*scale)/2,data.baseline-h*scale,w*scale,h*scale);
  }
  function itemCanvas(crop){
    const canvas=document.createElement('canvas');[canvas.width,canvas.height]=rendering.produce.canvas;canvas.crop=crop;
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label',produce[crop].name);canvas.className='produce-image';
    itemViews.add(canvas);drawItem(canvas);return canvas;
  }
  function buttons(id,value){
    document.querySelectorAll(id+' button').forEach(b=>{
      b.classList.toggle('active',+b.dataset.value===value);b.setAttribute('aria-pressed',String(+b.dataset.value===value));
    });
  }
  function renderPlots(){
    document.querySelectorAll('#plots .aligned-soil').forEach(el=>soilViews.delete(el));
    document.querySelectorAll('#plots .aligned-plant').forEach(el=>plantViews.delete(el));$('#plots').innerHTML='';
    plots.forEach((p,i)=>{
      const lifted=cargo&&cargo.plot===i&&!objectState().sourcePlantVisible;
      const b=document.createElement('button');b.className='plot'+(selected===i?' selected':'');
      b.setAttribute('aria-label','田區 '+(i+1)+'，'+produce[p.crop].name+'，'+(lifted?'已拿起':stages[p.stage]));
      b.setAttribute('aria-pressed',String(selected===i));
      b.innerHTML='<div class="sprite farm soil"></div><div class="sprite farm plant"></div>';
      b.children[0].style.zIndex=rendering.layerZ.soil;b.children[1].style.zIndex=rendering.layerZ.plant;
      position(b.children[0],p.soil,0,p.variant);position(b.children[1],p.stage,p.crop);b.children[1].hidden=!!lifted;
      b.onclick=()=>{if(harvestTarget){$('#status').textContent='正在拿起作物，完成後即可移動。';return;}moveTo(i);};
      $('#plots').append(b);
    });
  }
  function sync(){
    const p=plots[selected],locked=!!harvestTarget||!!(cargo&&cargo.plot===selected);
    $('#soil-variant').value=p.variant;$('#crop').value=p.crop;$('#growth').value=p.stage;$('#stage-name').textContent=stages[p.stage];buttons('#soils',p.soil);
    $('#crop').disabled=locked;$('#growth').disabled=locked;
    $('#drop').disabled=!cargo||!!harvestTarget||!!movement;
    $('#heading').textContent='移動朝向：'+directions[heading].name;
    $('#cargo-status').textContent=cargo?produce[cargo.crop].name+' × 1 ／ '+manifest.carry.capacity:(harvestTarget?'正在拿起…':'空手 ／ 最多 '+manifest.carry.capacity+' 個');
  }
  function showCargo(){
    const holder=$('#held-item');
    if(!cargo){holder.hidden=true;for(const c of holder.children)itemViews.delete(c);holder.replaceChildren();return;}
    if(!holder.firstElementChild||holder.firstElementChild.crop!==cargo.crop){
      for(const c of holder.children)itemViews.delete(c);holder.replaceChildren(itemCanvas(cargo.crop));
    }
    const state=objectState();holder.hidden=!state.cargoVisible;holder.classList.toggle('lifting',state.cargoPose==='lifting');
  }
  $('#actions').replaceChildren();
  manifest.playback.actionClips.forEach((name,i)=>{
    const button=document.createElement('button');button.dataset.value=i;button.textContent=actions[i];$('#actions').append(button);
  });
  $('#actions').onclick=e=>{
    if(!e.target.matches('button'))return;const next=+e.target.dataset.value;
    if(movement){$('#status').textContent='移動完成後即可切換動作。';return;}
    if(harvestTarget){$('#status').textContent=paused?'採收已暫停，請先播放動畫。':'正在採收，一次只能拿起一個作物。';return;}
    if(cargo){
      if(next===idleAction){directionalPose=false;action=idleAction;resetFrame();buttons('#actions',idleAction);updateRobot();}
      $('#status').textContent=next===idleAction?'正舉著 1 個'+produce[cargo.crop].name+'，可點田區移動。':'一次只能拿一個，請先放下頭上的作物。';return;
    }
    directionalPose=false;action=next;
    if(action===harvestAction){harvestTarget={plot:selected,crop:plots[selected].crop};$('#status').textContent=paused?'採收已就緒，按「播放動畫」開始。':'正在拿起'+produce[harvestTarget.crop].name+'…';}
    else $('#status').textContent='小機器人正在'+actions[action]+(action===idleAction?'':clips[clipName()].loop?'（動作循環預覽）':'（播放一次）');
    resetFrame();buttons('#actions',action);updateRobot();sync();
  };
  $('#drop').onclick=()=>{
    if(!cargo||harvestTarget||movement)return;
    const name=produce[cargo.crop].name;cargo=null;action=idleAction;directionalPose=false;resetFrame();
    showCargo();renderPlots();sync();buttons('#actions',idleAction);updateRobot();
    $('#status').textContent='已放下'+name+'，原田區恢復展示，可再次採收。';
  };
  $('#soils').onclick=e=>{if(!e.target.matches('button'))return;plots[selected].soil=+e.target.dataset.value;renderPlots();sync();};
  soilData.presets.forEach(p=>{
    const option=document.createElement('option');option.value=p.id;option.textContent=p.label;$('#soil-variant').append(option);
  });
  $('#soil-variant').onchange=e=>{plots[selected].variant=e.target.value;renderPlots();sync();};
  soilData.states.forEach(state=>{
    const row=document.createElement('div');row.className='soil-variation-row';
    const title=document.createElement('h3');title.textContent=state.label;row.append(title);
    soilData.presets.forEach(preset=>{
      const card=document.createElement('button');card.className='soil-variant-card';
      card.setAttribute('aria-label',state.label+'・'+preset.label+'，套用至選取田區');
      const tile=document.createElement('div');tile.className='sprite farm variant-tile';position(tile,state.soilIndex,0,preset.id);
      const label=document.createElement('span');label.textContent=preset.label;card.append(tile,label);
      card.onclick=()=>{plots[selected].soil=state.soilIndex;plots[selected].variant=preset.id;renderPlots();sync();};
      row.append(card);
    });
    $('#soil-variants').append(row);
  });
  $('#crop').replaceChildren();
  manifest.crops.forEach(c=>{const option=document.createElement('option');option.value=c.labValue;option.textContent=c.name;$('#crop').append(option);});
  $('#crop').onchange=e=>{plots[selected].crop=+e.target.value;renderPlots();sync();};
  $('#growth').oninput=e=>{plots[selected].stage=+e.target.value;renderPlots();sync();};
  function pauseLabel(){$('#pause').textContent=paused?'播放動畫':'暫停動畫';$('#pause').setAttribute('aria-pressed',String(paused));}
  $('#pause').onclick=()=>{paused=!paused;pauseLabel();};

  const catalog=[];
  [['idle','原版待命'],['sow','播種'],['water','澆水'],['harvest','空手採收'],['scan','範圍掃描'],['stuck','當機循環'],[manifest.playback.decisionClips.thinking,'判斷燈號']].forEach(([key,label])=>{
    catalog.push({label,type:'robot',row:clips[key].poseRows[0]});
  });
  clips[manifest.playback.directionalClips.empty].poseRows.forEach((row,i)=>catalog.push({label:directions[i].name+'向漂浮',type:'robot',row}));
  clips[manifest.playback.directionalClips.loaded].poseRows.forEach((row,i)=>catalog.push({label:'持物・'+directions[i].name,type:'robot',row}));
  catalog.push({label:'持物・待機',type:'robot',row:clips[manifest.playback.restClips.loaded].poseRows[0]},{label:'土壤狀態',type:'farm',row:0});
  manifest.crops.forEach(c=>catalog.push({label:c.name,type:'farm',row:c.labValue}));
  catalog.forEach(({label,type,row})=>{
    const r=document.createElement('div');r.className='catalog-row';const title=document.createElement('strong');title.textContent=label;r.append(title);
    const count=type==='robot'?rendering.robotPoses[row].frames.length:row===0?soilLabels.length:cropByValue.get(row).frames.length;
    if(count>4)r.classList.add('expanded-catalog');
    for(let c=0;c<count;c++){
      const cell=document.createElement('div');cell.className='sample';const s=document.createElement('div');s.className='sprite '+type;position(s,c,row);
      if(type==='robot'&&rendering.robotPoses[row].frames[c].cargoAnchorPath){
        const held=document.createElement('div');held.className='sample-cargo';
        held.append(itemCanvas(cropById.get(rendering.lab.sampleCarryCrops[c%rendering.lab.sampleCarryCrops.length]).labValue));
        s.append(held);s.sampleCargo=held;drawRobot(s);
      }
      cell.append(s,document.createTextNode(type==='robot'?(rendering.robotPoses[row].frames[c].label||'動作 '+(c+1)):row===0?soilLabels[c]:stages[c]));r.append(cell);
    }
    $('#catalog').append(r);
  });
  Object.entries(produce).forEach(([id,item])=>{
    const card=document.createElement('article');card.className='produce-card';card.append(itemCanvas(+id));
    const title=document.createElement('h3');title.textContent=item.name;
    const note=document.createElement('p');note.textContent='單個收成・攜帶與展示共用';
    const link=document.createElement('a');link.href=item.file;link.download='';link.textContent='下載透明素材 ↗';
    card.append(title,note,link);$('#produce-catalog').append(card);
  });
  function drawMainAsset(canvas,item){
    const ctx=canvas.getContext('2d'),source=imageSource(item.file),[sx,sy,sw,sh]=item.sourceRect;
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;
    if(!source.complete||!source.naturalWidth)return;
    if(item.repeat.x||item.repeat.y){
      const [dw,dh]=item.recommendedDisplaySize;
      for(let y=0;y<canvas.height;y+=item.repeat.y?dh:canvas.height){
        for(let x=0;x<canvas.width;x+=item.repeat.x?dw:canvas.width)ctx.drawImage(source,sx,sy,sw,sh,x,y,dw,dh);
      }
      return;
    }
    const scale=Math.min(canvas.width/sw,canvas.height/sh),dx=(canvas.width-sw*scale)/2,dy=(canvas.height-sh*scale)/2;
    ctx.drawImage(source,sx,sy,sw,sh,dx,dy,sw*scale,sh*scale);
    if(item.textRect&&$('#main-sign-text').checked){
      const [x,y,w,h]=item.textRect,[tx,ty,tw,th]=[dx+x*scale,dy+y*scale,w*scale,h*scale];
      ctx.save();ctx.strokeStyle=item.typeColor;ctx.lineWidth=4*scale;ctx.setLineDash([8*scale,6*scale]);ctx.strokeRect(tx,ty,tw,th);
      ctx.beginPath();ctx.rect(tx,ty,tw,th);ctx.clip();ctx.fillStyle=item.textStyle.color;
      ctx.font=(Math.min(item.textStyle.maxFontSize,h)*scale)+'px "PingFang TC",sans-serif';ctx.textAlign=item.textStyle.align;ctx.textBaseline=item.textStyle.verticalAlign;
      ctx.fillText(item.label,tx+tw/2,ty+th/2,tw);ctx.restore();
    }
  }
  $('#main-sign-text').checked=mainAssets.lab.signTextPreviewDefault;
  $('#main-sign-text').onchange=()=>mainAssetViews.forEach((item,canvas)=>{if(item.textRect)drawMainAsset(canvas,item);});
  mainAssets.items.forEach(item=>{
    const card=document.createElement('article');card.className='main-asset-card'+(item.previewCanvas?' main-asset-tile':'')+(item.textRect?' main-asset-sign':'');
    const title=document.createElement('h3');title.textContent=item.name;
    const canvas=document.createElement('canvas');
    [canvas.width,canvas.height]=item.previewCanvas||(item.textRect?item.sourceRect.slice(2):item.recommendedDisplaySize);
    canvas.className='main-asset-image';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',item.name+(item.previewCanvas?'・重複鋪排預覽':''));
    if(item.id==='stoneFloor')canvas.style.backgroundColor=mainAssets.lab.groutColor;
    mainAssetViews.set(canvas,item);drawMainAsset(canvas,item);
    const note=document.createElement('p');note.textContent=item.previewCanvas?'單元 '+item.repeat.unitSize.join(' × ')+' 原圖像素 ／ 顯示 '+item.recommendedDisplaySize.join(' × '):item.textRect?'牌面留白，可勾選疊字示意':'建議顯示 '+item.recommendedDisplaySize.join(' × ')+' 像素';
    const link=document.createElement('a');link.href='assets/'+item.file;link.textContent='查看透明原圖 ↗';
    card.append(title,canvas,note,link);$('#main-asset-samples').append(card);
  });

  // Boundary geometry and placement are driven by manifest.landBoundary.
  function boundaryGeometry(cells){
    const occupied=new Set(cells.map(([x,y])=>x+','+y)),edges=[],vertices=new Map();
    for(const key of occupied){
      const [x,y]=key.split(',').map(Number);
      for(const side of boundary.geometry.sides){
        const [nx,ny]=side.neighbor;if(occupied.has((x+nx)+','+(y+ny)))continue;
        const start=[x+side.start[0],y+side.start[1]],end=[x+side.end[0],y+side.end[1]];
        edges.push({start,end,part:side.part});
        for(const point of [start,end])vertices.set(point.join(','),point);
      }
    }
    return {edges,vertices:[...vertices.values()]};
  }
  function addBoundarySprites(sprites,cells,origin,tile,blit){
    const geometry=boundaryGeometry(cells),[ox,oy]=origin,[tw,th]=tile;
    const project=([x,y])=>[ox+x*tw,oy+y*th],z=boundary.depthOrder.kindOrder;
    for(const edge of geometry.edges){
      const part=boundary.parts[edge.part],[ax,ay]=project(edge.start),[bx,by]=project(edge.end);
      const [pa,pb]=part.endpointRatios;
      const w=bx===ax?part.displayThickness:(bx-ax)/(pb[0]-pa[0]);
      const h=by===ay?part.displayThickness:(by-ay)/(pb[1]-pa[1]);
      const target=[ax-pa[0]*w,ay-boundary.placement.ropeElevation-pa[1]*h,w,h];
      sprites.push({groundX:(ax+bx)/2,groundY:(ay+by)/2,kindOrder:z.rope,draw:()=>blit(boundary.atlas,part.sourceRect,target)});
    }
    for(const vertex of geometry.vertices){
      const [gx,gy]=project(vertex),part=boundary.parts.post,[sw,sh]=part.sourceRect.slice(2);
      const s=Math.min(part.recommendedDisplaySize[0]/sw,part.recommendedDisplaySize[1]/sh);
      sprites.push({groundX:gx,groundY:gy,kindOrder:z.post,draw:()=>blit(boundary.atlas,part.sourceRect,[gx-part.groundAnchor[0]*s,gy-part.groundAnchor[1]*s,sw*s,sh*s])});
    }
    return geometry;
  }
  function drawBoundarySample(canvas,sample){
    const ctx=canvas.getContext('2d'),lab=boundary.lab,[ox,oy]=lab.origin,[tw,th]=lab.tileSize;
    ctx.clearRect(0,0,...lab.canvas);ctx.imageSmoothingEnabled=false;
    ctx.fillStyle=valley.environment.groundColor;ctx.fillRect(0,0,...lab.canvas);
    const blit=(file,rect,target)=>{const image=imageSource(file);if(image.complete&&image.naturalWidth)ctx.drawImage(image,...rect,...target);};
    const soil=soilData.states.find(s=>s.soilIndex===lab.soilIndex).variants.find(v=>v.id==='plain');
    const sprites=[];
    sample.cells.forEach(([x,y],i)=>{
      for(const layer of [...soil.layers].sort((a,b)=>a.z-b.z)){
        const [dx,dy,w,h]=layer.destinationRect,[cw,ch]=soilData.canvas;
        blit(layer.atlas,layer.sourceRect,[ox+x*tw+dx/cw*tw,oy+y*th+dy/ch*th,w/cw*tw,h/ch*th]);
      }
      const crop=cropById.get(lab.cropCycle[i%lab.cropCycle.length]),frame=crop.frames[lab.cropStage];
      const gx=ox+(x+lab.plantGroundAnchor[0])*tw,gy=oy+(y+lab.plantGroundAnchor[1])*th;
      const s=frame.scale*lab.cropDisplaySize/rendering.plantCanvas[0],[sw,sh]=frame.sourceRect.slice(2);
      sprites.push({groundX:gx,groundY:gy,kindOrder:valley.depthOrder.kindOrder.plant,draw:()=>blit(crop.atlas,frame.sourceRect,[gx-frame.root[0]*s,gy-frame.root[1]*s,sw*s,sh*s])});
    });
    addBoundarySprites(sprites,sample.cells,lab.origin,lab.tileSize,blit);
    sprites.sort((a,b)=>{for(const key of boundary.depthOrder.sortKey){const d=a[key]-b[key];if(d)return d;}return 0;}).forEach(sprite=>sprite.draw());
  }
  const valleyCanvas=$('#valley-preview');[valleyCanvas.width,valleyCanvas.height]=valley.preview.canvas;
  function drawValley(){
    const ctx=valleyCanvas.getContext('2d'),[cw,ch]=valley.preview.canvas;
    const view=valley.projection.views[valleyState.view],[tw,th]=view.tileSize,[ox,oy]=view.previewOrigin;
    ctx.clearRect(0,0,cw,ch);ctx.imageSmoothingEnabled=false;ctx.fillStyle=valley.environment.skyColor;ctx.fillRect(0,0,cw,ch);
    const blit=(file,rect,target)=>{const source=imageSource(file);if(source.complete&&source.naturalWidth)ctx.drawImage(source,...rect,...target);};
    for(const layer of [...valley.environment.layers].sort((a,b)=>a.z-b.z)){
      const asset=valley.assets[layer.asset],[rx,ry,rw,rh]=layer.rect,[x,y,w,h]=[rx*cw,ry*ch,rw*cw,rh*ch];
      if(layer.repeat){
        ctx.fillStyle=asset.baseColor;ctx.fillRect(x,y,w,h);ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
        const [dw,dh]=asset.repeatDisplaySize;
        for(let py=y;py<y+h;py+=dh)for(let px=x;px<x+w;px+=dw)blit(asset.file,asset.sourceRect,[px,py,dw,dh]);
        ctx.restore();
      }else blit(asset.file,asset.sourceRect,[x,y,w,h]);
    }
    const cells=valley.preview.fields.flatMap(field=>field.cells.map(([x,y])=>({x,y,field}))),occupied=new Set(cells.map(c=>c.x+','+c.y));
    const soil=soilData.states.find(s=>s.soilIndex===valleyState.soil),[sw,sh]=soilData.canvas;
    cells.forEach((cell,i)=>{
      const preset=soil.variants.find(v=>v.id===valley.preview.variantCycle[i%valley.preview.variantCycle.length]);
      for(const layer of [...preset.layers].sort((a,b)=>a.z-b.z)){
        const [x,y,w,h]=layer.destinationRect;
        blit(layer.atlas,layer.sourceRect,[ox+cell.x*tw+x/sw*tw,oy+cell.y*th+y/sh*th,w/sw*tw,h/sh*th]);
      }
    });
    const [nx,ny]=valley.terrain.frontNeighbor,front=valley.assets.soilFront;
    if(view.frontDepth)for(const cell of cells){
      if(!occupied.has((cell.x+nx)+','+(cell.y+ny))){
        const sample=front.frames.find(f=>f.soilIndex===valleyState.soil);
        blit(front.file,sample.sourceRect,[ox+cell.x*tw,oy+(cell.y+1)*th,tw,view.frontDepth]);
      }
    }
    const sprites=[],u=valley.uprightSprites,kind=valley.depthOrder.kindOrder;
    if($('#boundary-visible').checked)addBoundarySprites(sprites,cells.map(c=>[c.x,c.y]),[ox,oy],[tw,th],blit);
    for(const prop of valley.preview.props||[]){
      const asset=valley.assets[prop.asset],[gx,gy]=prop.groundPosition;
      sprites.push({groundX:gx,groundY:gy,kindOrder:kind[asset.sortKind],draw:()=>{
        const [sw,sh]=asset.sourceRect.slice(2),[aw,ah]=asset.groundAnchor;
        const scale=Math.min(asset.recommendedDisplaySize[0]/sw,asset.recommendedDisplaySize[1]/sh);
        blit(asset.file,asset.sourceRect,[gx-aw*scale,gy-ah*scale,sw*scale,sh*scale]);
      }});
    }
    cells.forEach((cell,i)=>{
      const crop=cropById.get(valley.preview.cropCycle[i%valley.preview.cropCycle.length]),sample=crop.frames[valley.preview.stage];
      const gx=ox+(cell.x+u.plantGroundAnchor[0])*tw,gy=oy+(cell.y+u.plantGroundAnchor[1])*th;
      sprites.push({groundX:gx,groundY:gy,kindOrder:kind.plant,draw:()=>{
        const [x,y,w,h]=sample.sourceRect,[rx,ry]=sample.root,s=sample.scale*u.plantCanvasDisplaySize[0]/rendering.plantCanvas[0];
        blit(crop.atlas,[x,y,w,h],[gx-rx*s,gy-ry*s,w*s,h*s]);
      }});
    });
    valley.preview.robots.forEach(robot=>{
      const clip=clips[robot.clip],pose=rendering.robotPoses[clip.poseRows[0]],sample=pose.frames[clip.frameOrder[robot.step]];
      const gx=ox+(robot.cell[0]+u.robotGroundAnchor[0])*tw,gy=oy+(robot.cell[1]+u.robotGroundAnchor[1])*th;
      sprites.push({groundX:gx,groundY:gy,kindOrder:kind.robot,draw:()=>{
        const [x,y,w,h]=sample.sourceRect,[cx,cy,height]=lookup(sample.alignmentPath);
        const s=alignment.bodyHeight/height*u.robotCanvasDisplaySize[0]/alignment.canvas,[dx,dy]=u.robotCenterOffset;
        blit(pose.atlas,[x,y,w,h],[gx+dx+(x-cx)*s,gy+dy+(y-cy)*s,w*s,h*s]);
      }});
    });
    valley.preview.fields.forEach(field=>{
      const sign=mainAssets.items.find(i=>i.typeId===field.signType),[dx,dy]=valley.preview.signOffset;
      const gx=ox+(Math.min(...field.cells.map(c=>c[0]))+dx)*tw,gy=oy+(Math.max(...field.cells.map(c=>c[1]))+dy)*th;
      sprites.push({groundX:gx,groundY:gy,kindOrder:kind.sign,draw:()=>{
        const [sw,sh]=sign.sourceRect.slice(2),s=Math.min(u.signDisplaySize[0]/sw,u.signDisplaySize[1]/sh);
        const x=gx-sign.groundAnchor[0]*s,y=gy-sign.groundAnchor[1]*s;blit(sign.file,sign.sourceRect,[x,y,sw*s,sh*s]);
        const [tx,ty,ww,hh]=sign.textRect;ctx.save();ctx.fillStyle=sign.textStyle.color;ctx.textAlign=sign.textStyle.align;ctx.textBaseline=sign.textStyle.verticalAlign;
        ctx.font=(sign.textStyle.maxFontSize*s)+'px "PingFang TC",sans-serif';ctx.fillText(sign.label,x+(tx+ww/2)*s,y+(ty+hh/2)*s,ww*s);ctx.restore();
      }});
    });
    sprites.sort((a,b)=>{for(const key of valley.depthOrder.sortKey){const d=a[key]-b[key];if(d)return d;}return 0;}).forEach(sprite=>sprite.draw());
    $('#valley-view-note').textContent=view.label+' ／ 田面 '+tw+' × '+th+' ／ 前緣 '+view.frontDepth+' 像素・'+soil.label;
  }
  // Static angled-scene art preview. Projection, anchors and layout all come from manifest.
  const angled=manifest.valleyScene,angledCanvas=$('#angled-preview'),angledSamples=new Map();
  const angledLab=angled.lab,angledView=angled.projection.views[angledLab.initialView];
  [angledCanvas.width,angledCanvas.height]=angledLab.canvas;
  function angledProjection(x,y){
    const t=angledView.rotationDegrees*Math.PI/180,[tw,th]=angledView.logicalTileSize,[ox,oy]=angledView.previewOrigin;
    return [ox+x*tw*Math.cos(t)-y*th*Math.sin(t),oy+angledView.scaleY*(x*tw*Math.sin(t)+y*th*Math.cos(t))];
  }
  function angledSprite(ctx,asset,gx,gy){
    const source=imageSource(asset.file);if(!source.complete||!source.naturalWidth)return;
    const [sw,sh]=asset.sourceRect.slice(2),[dw,dh]=asset.recommendedDisplaySize;
    const scale=Math.min(dw/sw,dh/sh),[ax,ay]=asset.groundAnchor;
    ctx.drawImage(source,...asset.sourceRect,gx-ax*scale,gy-ay*scale,sw*scale,sh*scale);
  }
  function angledTile(ctx,asset,x,y,size=angled.logicalTileSize){
    const source=imageSource(asset.file),[w,h]=size;
    if(asset.baseColor){ctx.fillStyle=asset.baseColor;ctx.fillRect(x,y,w,h);}
    if(source.complete&&source.naturalWidth){
      const [dx,dy,dw,dh]=asset.destinationRect,[cw,ch]=asset.logicalCanvas;
      ctx.drawImage(source,...asset.sourceRect,x+dx/cw*w,y+dy/ch*h,dw/cw*w,dh/ch*h);
    }
  }
  function drawAngledSample(canvas,asset){
    const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;
    if(asset.layer==='ground-tile'&&asset.repeatMode!=='scattered-decal-not-seamless'){
      for(let y=0;y<3;y++)for(let x=0;x<3;x++){
        angledTile(ctx,angled.assets.dirtPath,x*64,y*64);
        if(asset!==angled.assets.dirtPath)angledTile(ctx,asset,x*64,y*64);
      }
    }else{
      const image=imageSource(asset.file);if(!image.complete||!image.naturalWidth)return;
      const [sw,sh]=asset.sourceRect.slice(2),scale=Math.min(canvas.width/sw,canvas.height/sh);
      ctx.drawImage(image,...asset.sourceRect,(canvas.width-sw*scale)/2,(canvas.height-sh*scale)/2,sw*scale,sh*scale);
    }
  }
  function drawAngledTechnical(){
    const ctx=angledCanvas.getContext('2d'),[cw,ch]=angledLab.canvas,assets=angled.assets;
    ctx.clearRect(0,0,cw,ch);ctx.imageSmoothingEnabled=false;ctx.fillStyle=angled.rendering.skyColor;ctx.fillRect(0,0,cw,ch);
    for(const asset of Object.values(assets).filter(a=>a.layer==='backdrop').sort((a,b)=>a.z-b.z)){
      const img=imageSource(asset.file);if(img.complete&&img.naturalWidth)ctx.drawImage(img,...asset.sourceRect,...asset.viewportRect.map((n,i)=>n*(i%2?ch:cw)));
    }
    ctx.fillStyle=angled.rendering.groundColor;ctx.fillRect(0,ch*angledLab.groundStartY,cw,ch*(1-angledLab.groundStartY));
    const [fx,fy]=angledLab.fieldOffset,cells=valley.preview.fields.flatMap(f=>f.cells.map(([x,y],i)=>({x:x+fx,y:y+fy,i,field:f}))),occupied=new Set(cells.map(c=>c.x+','+c.y));
    const t=angledView.rotationDegrees*Math.PI/180,s=angledView.scaleY,[ox,oy]=angledView.previewOrigin;
    ctx.save();ctx.setTransform(Math.cos(t),s*Math.sin(t),-Math.sin(t),s*Math.cos(t),ox,oy);
    const [tw,th]=angledView.logicalTileSize;
    const soil=soilData.states.find(v=>v.soilIndex===valleyState.soil).variants.find(v=>v.id==='plain');
    for(const cell of cells)for(const layer of [...soil.layers].sort((a,b)=>a.z-b.z)){
      const source=imageSource(layer.atlas);if(!source.complete||!source.naturalWidth)continue;
      const [dx,dy,w,h]=layer.destinationRect,[sw,sh]=soilData.canvas;
      ctx.drawImage(source,...layer.sourceRect,cell.x*tw+dx/sw*tw,cell.y*th+dy/sh*th,w/sw*tw,h/sh*th);
    }
    for(const [x,y] of angledLab.pathCells)if(!occupied.has(x+','+y))angledTile(ctx,assets.dirtPath,x*tw,y*th);
    for(const [x,y] of angledLab.stoneCells)if(!occupied.has(x+','+y))angledTile(ctx,assets.steppingStones,x*tw,y*th);
    if($('#angled-grid').checked){
      ctx.strokeStyle='#f0e4bb';ctx.lineWidth=1;
      for(const cell of cells)ctx.strokeRect(cell.x*tw,cell.y*th,tw,th);
    }
    ctx.restore();
    const wallData=angled.rendering.frontWalls,wallAsset=valley.assets.soilFront,wallImage=imageSource(wallAsset.file),wallFrame=wallAsset.frames.find(f=>f.soilIndex===valleyState.soil);
    const faces=[];
    for(const cell of cells)for(const side of wallData.sides){
      const [nx,ny]=side.neighbor;if(occupied.has((cell.x+nx)+','+(cell.y+ny)))continue;
      const a=angledProjection(cell.x+side.start[0],cell.y+side.start[1]),b=angledProjection(cell.x+side.end[0],cell.y+side.end[1]);
      if(-(b[0]-a[0])<=0)continue;faces.push({a,b,y:(a[1]+b[1])/2});
    }
    if(wallImage.complete&&wallImage.naturalWidth)for(const {a,b} of faces.sort((a,b)=>a.y-b.y)){
      const [sw,sh]=wallFrame.sourceRect.slice(2);ctx.save();ctx.transform((b[0]-a[0])/sw,(b[1]-a[1])/sw,0,wallData.frontDepth/sh,a[0],a[1]);
      ctx.drawImage(wallImage,...wallFrame.sourceRect,0,0,sw,sh);ctx.restore();
    }
    const sprites=[],kinds=angled.rendering.depthOrder.kindOrder;
    function add(asset,cell,kind){const [gx,gy]=angledProjection(...cell);sprites.push({groundX:gx,groundY:gy,kindOrder:kinds[kind],draw:()=>angledSprite(ctx,asset,gx,gy)});}
    add(valley.assets.farmhouse,angledLab.farmhouseCell,'building');
    if($('#angled-props').checked)for(const prop of angledLab.props)add(assets[prop.asset],prop.cell,'prop');
    cells.forEach((cell,i)=>{
      const crop=cropById.get(valley.preview.cropCycle[i%valley.preview.cropCycle.length]),sample=crop.frames[angledLab.cropStage];
      const [gx,gy]=angledProjection(cell.x+valley.uprightSprites.plantGroundAnchor[0],cell.y+valley.uprightSprites.plantGroundAnchor[1]);
      sprites.push({groundX:gx,groundY:gy,kindOrder:kinds.plant,draw:()=>{
        const img=imageSource(crop.atlas);if(!img.complete||!img.naturalWidth)return;
        const scale=sample.scale*valley.uprightSprites.plantCanvasDisplaySize[0]/rendering.plantCanvas[0],[sw,sh]=sample.sourceRect.slice(2);
        ctx.drawImage(img,...sample.sourceRect,gx-sample.root[0]*scale,gy-sample.root[1]*scale,sw*scale,sh*scale);
      }});
    });
    const clip=clips[angledLab.robotClip],pose=rendering.robotPoses[clip.poseRows[0]],sample=pose.frames[clip.frameOrder[angledLab.robotStep]];
    for(const cell of angledLab.robotCells){
      const [gx,gy]=angledProjection(...cell);sprites.push({groundX:gx,groundY:gy,kindOrder:kinds.robot,draw:()=>{
        const img=imageSource(pose.atlas);if(!img.complete||!img.naturalWidth)return;
        const [x,y,w,h]=sample.sourceRect,[cx,cy,height]=lookup(sample.alignmentPath),scale=alignment.bodyHeight/height*valley.uprightSprites.robotCanvasDisplaySize[0]/alignment.canvas,[dx,dy]=valley.uprightSprites.robotCenterOffset;
        ctx.drawImage(img,x,y,w,h,gx+dx+(x-cx)*scale,gy+dy+(y-cy)*scale,w*scale,h*scale);
      }});
    }
    for(const field of valley.preview.fields){
      const sign=mainAssets.items.find(i=>i.typeId===field.signType),[dx,dy]=valley.preview.signOffset;
      add({...sign,recommendedDisplaySize:angledLab.signDisplaySize},[Math.min(...field.cells.map(c=>c[0]))+fx+dx,Math.max(...field.cells.map(c=>c[1]))+fy+dy],'sign');
    }
    sprites.sort((a,b)=>{for(const key of angled.rendering.depthOrder.sortKey){const d=a[key]-b[key];if(d)return d;}return 0;}).forEach(v=>v.draw());
    if($('#angled-frame').checked)for(const asset of Object.values(assets).filter(a=>a.layer==='foreground-frame')){
      const img=imageSource(asset.file);if(!img.complete||!img.naturalWidth)continue;
      const [x,y,w,h]=asset.viewportRect.map((n,i)=>n*(i%2?ch:cw)),[sw,sh]=asset.sourceRect.slice(2),scale=asset.fit==='cover-width'?w/sw:Math.min(w/sw,h/sh),dw=sw*scale,dh=sh*scale;
      const dx=asset.edge==='right'?x+w-dw:asset.edge==='bottom'?x+(w-dw)/2:x,dy=y+h-dh;
      ctx.drawImage(img,...asset.sourceRect,dx,dy,dw,dh);
    }
    $('#angled-view-note').textContent=angledView.label+' ／ 地面旋轉 '+angledView.rotationDegrees+'° ／ 田面基準 '+angledView.tileSize.join(' × ')+' ／ 土壁 '+angledView.frontDepth+'px';
  }
  function drawAngledScene(){
    if(!angled.composition||$('#angled-technical')?.checked)return drawAngledTechnical();
    const c=(!$('#angled-previous')?.checked&&angled.compositionV20)||angled.composition,ctx=angledCanvas.getContext('2d'),[cw,ch]=c.canvas,A=angled.assets,v=angled.projection.views[c.view],t=v.rotationDegrees*Math.PI/180,cs=Math.cos(t),sn=Math.sin(t),s=v.scaleY,[ox,oy]=c.origin;
    const project=(x,y)=>[ox+64*(x*cs-y*sn),oy+64*s*(x*sn+y*cs)];
    const ground=()=>ctx.setTransform(cs,s*sn,-sn,s*cs,ox,oy);
    ctx.clearRect(0,0,cw,ch);ctx.imageSmoothingEnabled=false;ctx.fillStyle=angled.rendering.skyColor;ctx.fillRect(0,0,cw,ch);
    for(const b of c.backgrounds){const a=A[b.asset],im=imageSource(a.file);if(im.complete&&im.naturalWidth)ctx.drawImage(im,...a.sourceRect,...b.rect);}
    ctx.save();ctx.beginPath();c.clearing.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();ground();
    const meadow=A.meadow,mi=imageSource(meadow.file),repeat=c.meadowRepeatSize,[minX,maxX,minY,maxY]=c.meadowRange;
    if(mi.complete&&mi.naturalWidth)for(let y=minY;y<maxY;y++)for(let x=minX;x<maxX;x++){
      ctx.save();ctx.translate(x*repeat,y*repeat);ctx.translate(x%2?repeat:0,y%2?repeat:0);ctx.scale(x%2?-1:1,y%2?-1:1);ctx.drawImage(mi,...meadow.sourceRect,0,0,repeat,repeat);ctx.restore();
    }
    for(const path of c.paths){
      ctx.save();ctx.beginPath();for(let i=1;i<path.length;i++){
        const a=path[i-1].map(n=>n*64),b=path[i].map(n=>n*64),length=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=-(b[1]-a[1])/length*c.pathWidth*32,dy=(b[0]-a[0])/length*c.pathWidth*32;
        ctx.moveTo(a[0]+dx,a[1]+dy);ctx.lineTo(b[0]+dx,b[1]+dy);ctx.lineTo(b[0]-dx,b[1]-dy);ctx.lineTo(a[0]-dx,a[1]-dy);ctx.closePath();
      }ctx.clip();for(let y=-2;y<8;y++)for(let x=-5;x<10;x++)angledTile(ctx,A.dirtPath,x*64,y*64);ctx.restore();
    }ctx.restore();
    const cells=c.fields.flatMap(f=>f.cells.map(([x,y])=>({x,y,crop:f.crop}))),occupied=new Set(cells.map(p=>p.x+','+p.y)),soil=soilData.states.find(v=>v.soilIndex===valleyState.soil).variants.find(v=>v.id==='plain');
    ctx.save();ground();for(const cell of cells){for(const layer of [...soil.layers].sort((a,b)=>a.z-b.z)){
      const im=imageSource(layer.atlas);if(!im.complete||!im.naturalWidth)continue;const [dx,dy,w,h]=layer.destinationRect,[sw,sh]=soilData.canvas;
      ctx.drawImage(im,...layer.sourceRect,cell.x*64+dx/sw*64,cell.y*64+dy/sh*64,w/sw*64,h/sh*64);
    }if($('#angled-grid').checked){ctx.strokeStyle='#f0e4bb';ctx.strokeRect(cell.x*64,cell.y*64,64,64);}}
    for(const d of c.groundDecals||[]){
      const a=A[d.asset],im=imageSource(a.file);if(!im.complete||!im.naturalWidth)continue;
      ctx.save();ctx.translate(d.center[0]*64,d.center[1]*64);ctx.scale(d.mirrorX?-1:1,d.mirrorY?-1:1);
      ctx.drawImage(im,...a.sourceRect,-d.size[0]*32,-d.size[1]*32,d.size[0]*64,d.size[1]*64);ctx.restore();
    }ctx.restore();
    const wall=valley.assets.soilFront,wi=imageSource(wall.file),wf=wall.frames.find(f=>f.soilIndex===valleyState.soil),faces=[];
    for(const cell of cells)for(const side of angled.rendering.frontWalls.sides){if(occupied.has((cell.x+side.neighbor[0])+','+(cell.y+side.neighbor[1])))continue;const a=project(cell.x+side.start[0],cell.y+side.start[1]),b=project(cell.x+side.end[0],cell.y+side.end[1]);if(b[0]<a[0])faces.push({a,b});}
    if(wi.complete&&wi.naturalWidth)for(const {a,b} of faces.sort((a,b)=>(a.a[1]+a.b[1])-(b.a[1]+b.b[1]))){const [w,h]=wf.sourceRect.slice(2);ctx.save();ctx.transform((b[0]-a[0])/w,(b[1]-a[1])/w,0,v.frontDepth/h,a[0],a[1]);ctx.drawImage(wi,...wf.sourceRect,0,0,w,h);ctx.restore();}
    const sprites=[],push=(p,draw,kindOrder=4)=>sprites.push({groundX:p[0],groundY:p[1],kindOrder,draw});
    for(const p of c.sprites){if(!$('#angled-props').checked&&!(c.essentialSprites||['conifers','sunlitTrees','farmhouse']).includes(p.asset))continue;const a=p.asset==='farmhouse'?valley.assets.farmhouse:A[p.asset];push(p.anchor,()=>angledSprite(ctx,{...a,recommendedDisplaySize:p.displaySize},...p.anchor));}
    for(const cell of cells)for(const offset of c.plantOffsets){const p=project(cell.x+offset[0],cell.y+offset[1]),crop=cropById.get(cell.crop),f=crop.frames[c.cropStage];push(p,()=>{const im=imageSource(crop.atlas);if(!im.complete||!im.naturalWidth)return;const sc=f.scale*c.plantSize/rendering.plantCanvas[0];ctx.drawImage(im,...f.sourceRect,p[0]-f.root[0]*sc,p[1]-f.root[1]*sc,f.sourceRect[2]*sc,f.sourceRect[3]*sc);},1);}
    for(const field of c.fields){const geometry=boundaryGeometry(field.cells),post={...boundary.parts.post,file:boundary.atlas,recommendedDisplaySize:c.boundary.postSize};
      for(const vertex of geometry.vertices){const p=project(...vertex);push(p,()=>angledSprite(ctx,post,...p),3);}
      for(const edge of geometry.edges){const a=project(...edge.start),b=project(...edge.end),p=[(a[0]+b[0])/2,(a[1]+b[1])/2];push(p,()=>{const im=imageSource(boundary.atlas),r=boundary.parts.horizontal.sourceRect;if(!im.complete||!im.naturalWidth)return;ctx.save();ctx.translate(a[0],a[1]-c.boundary.elevation);ctx.rotate(Math.atan2(b[1]-a[1],b[0]-a[0]));ctx.drawImage(im,...r,0,0,Math.hypot(b[0]-a[0],b[1]-a[1]),c.boundary.ropeThickness);ctx.restore();},0);}
    }
    const robot=c.staticRobot||{clip:angledLab.robotClip,step:angledLab.robotStep,canvasSize:c.robotSize,centerOffset:valley.uprightSprites.robotCenterOffset};
    const clip=clips[robot.clip],pose=rendering.robotPoses[clip.poseRows[0]],sample=pose.frames[clip.frameOrder[robot.step]];
    for(const cell of c.robots){const p=project(...cell);push(p,()=>{const im=imageSource(pose.atlas);if(!im.complete||!im.naturalWidth)return;const [x,y,w,h]=sample.sourceRect,[cx,cy,height]=lookup(sample.alignmentPath),scale=alignment.bodyHeight/height*robot.canvasSize/alignment.canvas,[dx,dy]=robot.centerOffset;ctx.drawImage(im,x,y,w,h,p[0]+dx+(x-cx)*scale,p[1]+dy+(y-cy)*scale,w*scale,h*scale);},2);}
    sprites.sort((a,b)=>a.groundY-b.groundY||a.groundX-b.groundX||a.kindOrder-b.kindOrder).forEach(p=>p.draw());
    if($('#angled-frame').checked)for(const [id,rect] of Object.entries(c.frameRects)){const a=A[id],im=imageSource(a.file);if(!im.complete||!im.naturalWidth)continue;const [x,y,w,h]=rect,[sw,sh]=a.sourceRect.slice(2),sc=Math.min(w/sw,h/sh),dw=sw*sc,dh=sh*sc;ctx.drawImage(im,...a.sourceRect,a.edge==='right'?x+w-dw:a.edge==='bottom'?x+(w-dw)/2:x,y+h-dh,dw,dh);}
    $('#angled-view-note').textContent=c.label+' ／ 18° 地面投影・64 × 40・13px 土壁 ／ 靜態美術預覽';
  }

  $('#angled-technical').onchange=drawAngledScene;
  $('#angled-previous').onchange=drawAngledScene;
  for(const [id,key] of [['angled-frame','initialFrameVisible'],['angled-props','initialPropsVisible'],['angled-grid','initialGroundGridVisible']]){
    $(('#'+id)).checked=angledLab[key];$(('#'+id)).onchange=drawAngledScene;
  }
  for(const id of [...angledLab.assetOrder,...(angledLab.additionalAssetOrderV20||[])]){
    const asset=angled.assets[id],card=document.createElement('figure'),title=document.createElement('figcaption'),canvas=document.createElement('canvas'),note=document.createElement('p'),link=document.createElement('a');
    const isTile=asset.layer==='ground-tile'&&asset.repeatMode!=='scattered-decal-not-seamless';[canvas.width,canvas.height]=isTile?[192,192]:asset.layer==='backdrop'?[320,160]:[192,160];
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label',asset.label+(isTile?'・三乘三拼接':''));
    title.textContent=asset.label+(asset.edge?'・貼齊'+({left:'左',right:'右',bottom:'下'}[asset.edge])+'側':'');
    note.textContent=(isTile?'64 × 64／3 × 3 鋪排':asset.recommendedDisplaySize.join(' × ')+'px')+'・'+Math.round(asset.fileBytes/1024)+' KiB'+(asset.footprint[0]?'・占 '+asset.footprint.join(' × ')+' 格':'・畫面定位');
    link.href='assets/'+asset.file;link.textContent='查看透明圖集 ↗';card.append(title,canvas,note,link);$('#angled-samples').append(card);angledSamples.set(canvas,asset);drawAngledSample(canvas,asset);
  }
  drawAngledScene();

  // Static world/land plan: the game keeps its own economy, save and arrangement code.
  function drawFarmWorld(){
    const world=manifest.farmWorld,canvas=$('#world-preview');if(!world||!canvas)return;
    const ctx=canvas.getContext('2d'),v=world.views.topDown,[cw,ch]=v.canvas,a=world.assets.overheadMap;
    ctx.clearRect(0,0,cw,ch);ctx.imageSmoothingEnabled=false;
    const im=imageSource(a.file);if(im.complete&&im.naturalWidth)ctx.drawImage(im,...a.sourceRect,0,0,cw,ch);
    const id=$('#world-phase').value,phase=world.expansion.phases.find(p=>p.id===id);
    if(!phase){$('#world-note').textContent='純俯視地圖・沒有烘焙田塊、圍欄或購地狀態';return;}
    const [ox,oy]=v.boardOrigin,[tw,th]=v.tileSize,[bx,by,bw,bh]=v.boardRect,open=new Set(phase.cells.map(p=>p.join(','))),lab=world.lab;
    for(const cell of world.board.cells){const [x,y]=cell;ctx.fillStyle=open.has(cell.join(','))?lab.ownedOverlay:lab.unownedOverlay;ctx.fillRect(ox+x*tw,oy+y*th,tw,th);}
    if($('#world-starter').checked){
      const soil=soilData.states.find(p=>p.soilIndex===lab.initialSoilIndex).variants.find(p=>p.id==='plain');
      for(const [x,y] of lab.starterPlotCells)for(const layer of [...soil.layers].sort((a,b)=>a.z-b.z)){
        const img=imageSource(layer.atlas);if(!img.complete||!img.naturalWidth)continue;
        const [dx,dy,w,h]=layer.destinationRect,[sw,sh]=soilData.canvas;ctx.drawImage(img,...layer.sourceRect,ox+x*tw+dx/sw*tw,oy+y*th+dy/sh*th,w/sw*tw,h/sh*th);
      }
    }
    if($('#world-grid').checked){ctx.lineWidth=1;ctx.strokeStyle=lab.gridColor;ctx.beginPath();for(let x=0;x<=world.board.columns;x++){ctx.moveTo(ox+x*tw,oy);ctx.lineTo(ox+x*tw,oy+bh);}for(let y=0;y<=world.board.rows;y++){ctx.moveTo(ox,oy+y*th);ctx.lineTo(ox+bw,oy+y*th);}ctx.stroke();}
    if($('#world-zones').checked){
      for(const p of world.expansion.phases){const [x,y,w,h]=p.rect;ctx.lineWidth=3;ctx.strokeStyle=lab.colors[p.id];ctx.strokeRect(ox+x*tw,oy+y*th,w*tw,h*th);}
      const neighbors=[[1,0],[-1,0],[0,1],[0,-1]];ctx.strokeStyle=lab.nextCellStroke;ctx.lineWidth=2;ctx.setLineDash([6,5]);
      for(const [x,y] of world.board.cells){if(open.has(x+','+y)||!neighbors.some(([dx,dy])=>open.has((x+dx)+','+(y+dy))))continue;ctx.strokeRect(ox+x*tw+5,oy+y*th+5,tw-10,th-10);}ctx.setLineDash([]);
    }
    $('#world-note').textContent=phase.label+'：'+phase.totalCells+' / 84 格・累計購地 '+phase.cumulativeCost.toLocaleString('zh-TW')+' 金錢・白色虛線為相鄰可擴格（示意）';
  }
  if(manifest.farmWorld){
    const w=manifest.farmWorld,canvas=$('#world-preview');[canvas.width,canvas.height]=w.lab.canvas;
    for(const phase of w.expansion.phases){const option=document.createElement('option');option.value=phase.id;option.textContent=phase.label+'・'+phase.totalCells+' 格';$('#world-phase').append(option);}
    $('#world-phase').value=w.lab.defaultPhase;
    for(const [id,value] of [['world-grid',w.lab.showGridInitially],['world-zones',w.lab.showZonesInitially],['world-starter',w.lab.showStarterInitially]]){$('#'+id).checked=value;$('#'+id).onchange=drawFarmWorld;}
    $('#world-phase').onchange=drawFarmWorld;$('#world-map-link').href='assets/'+w.assets.overheadMap.file;
    drawFarmWorld();
  }

  // Source-resolution QA. Reference images are requested only after the explicit load button.
  let referenceBundle=null,comparisonCases=[],comparisonReady=false;
  function referenceLookup(a,path){return path.reduce((v,k)=>v[k],a);}
  function compareProduce(ctx,bundle,crop,x,y,size){
    const item=bundle.manifest.produce.find(p=>p.id===crop),im=imageSource(item.file);if(!im.complete||!im.naturalWidth)return;
    const [sw,sh]=item.sourceRect.slice(2),data=bundle.manifest.rendering.produce,k=size*data.maxContentSize/data.canvas[0]/Math.max(sw,sh),baseline=y-size*(1-data.baseline/data.canvas[0]);
    ctx.drawImage(im,...item.sourceRect,x-sw*k/2,baseline-sh*k,sw*k,sh*k);
  }
  function drawComparisonCase(canvas,bundle,c){
    const ctx=canvas.getContext('2d'),m=bundle.manifest,a=bundle.align;ctx.clearRect(0,0,256,256);ctx.imageSmoothingEnabled=false;
    ctx.fillStyle=m.assetOptimization?.comparison.background||manifest.assetOptimization.comparison.background;ctx.fillRect(0,0,256,256);
    ctx.strokeStyle='#f0e4bb55';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(128,10);ctx.lineTo(128,246);ctx.moveTo(10,190);ctx.lineTo(246,190);ctx.stroke();
    if(c.kind==='robot'){
      const pose=m.rendering.robotPoses[c.row],f=pose.frames[c.frame],im=imageSource(pose.atlas);if(!im.complete||!im.naturalWidth)return;
      const [sx,sy,sw,sh]=f.sourceRect,[cx,cy,shell]=referenceLookup(a,f.alignmentPath),size=192,unit=size/a.canvas,k=a.bodyHeight/shell*unit,bob=f.bobIndex==null?0:a.bob[f.bobIndex],x=32+a.bodyCenter[0]*unit-(cx-sx)*k,y=24+(a.bodyCenter[1]+bob)*unit-(cy-sy)*k;
      ctx.drawImage(im,sx,sy,sw,sh,x,y,sw*k,sh*k);
      if(f.cargoAnchorPath){const [hx,hy]=referenceLookup(a,f.cargoAnchorPath);compareProduce(ctx,bundle,'carrot',x+(hx-sx)*k,y+(hy-sy)*k,size*m.rendering.cargo.widthRatio);}
      return;
    }
    if(c.kind==='crop'){
      const crop=m.crops.find(p=>p.id===c.crop),f=crop.frames[c.frame],im=imageSource(crop.atlas),k=150/m.rendering.plantCanvas[0]*f.scale;
      if(im.complete&&im.naturalWidth)ctx.drawImage(im,...f.sourceRect,128-f.root[0]*k,190-f.root[1]*k,f.sourceRect[2]*k,f.sourceRect[3]*k);return;
    }
    if(c.kind==='soil'){
      const b=m.pixelBoundaries,im=imageSource(m.rendering.soil.atlas);if(im.complete&&im.naturalWidth)ctx.drawImage(im,b[c.frame],b[0],b[c.frame+1]-b[c.frame],b[1]-b[0],48,65,160,160);return;
    }
    if(c.kind==='produce'){compareProduce(ctx,bundle,c.crop,128,190,64);return;}
    if(c.kind==='bubble'){
      const t=m.thoughtBubbles,f=t.frames[c.frame],im=imageSource(t.atlas),k=176/t.canvas[0],[x,y,w,h]=f.destinationRect;
      if(im.complete&&im.naturalWidth)ctx.drawImage(im,...f.sourceRect,40+x*k,45+y*k,w*k,h*k);return;
    }
    if(c.kind==='wave'){
      const e=m.effectClips.areaScanWave,f=e.frames[c.frame],im=imageSource(e.atlas),w=224*f.sizeRatio[0],h=200*f.sizeRatio[1];if(im.complete&&im.naturalWidth)ctx.drawImage(im,...f.sourceRect,128-w/2,128-h/2,w,h);return;
    }
    if(c.kind==='icon'){
      const item=m.mainScreenAssets.items.find(p=>p.id===c.id),im=imageSource(item.file),[sw,sh]=item.sourceRect.slice(2),k=40/Math.max(sw,sh);if(im.complete&&im.naturalWidth)ctx.drawImage(im,...item.sourceRect,128-sw*k/2,128-sh*k/2,sw*k,sh*k);
    }
  }
  function drawAssetComparison(){
    if(!comparisonReady||!referenceBundle)return;
    const c=comparisonCases[+$('#compare-frame').value];if(!c)return;
    drawComparisonCase($('#compare-original'),referenceBundle,c);drawComparisonCase($('#compare-half'),{manifest,align:alignment},c);
  }
  function compareFileChanged(){
    const file=$('#compare-file').value;comparisonCases=[];
    for(const [row,p] of Object.entries(referenceBundle.manifest.rendering.robotPoses))if(p.atlas===file)p.frames.forEach((f,frame)=>comparisonCases.push({kind:'robot',row,frame,label:'姿勢 '+row+'・'+(f.label||'第 '+(frame+1)+' 格')+(f.cargoAnchorPath?'・持物錨點':'' )}));
    for(const crop of referenceBundle.manifest.crops)if(crop.atlas===file)crop.frames.forEach((f,frame)=>comparisonCases.push({kind:'crop',crop:crop.id,frame,label:crop.name+'・'+crop.stageLabels[frame]}));
    if(file===referenceBundle.manifest.rendering.soil.atlas)for(let frame=0;frame<4;frame++)comparisonCases.unshift({kind:'soil',frame,label:soilLabels[frame]+'土壤'});
    for(const p of referenceBundle.manifest.produce)if(p.file===file)comparisonCases.push({kind:'produce',crop:p.id,label:referenceBundle.manifest.crops.find(c=>c.id===p.id).name+'・收成'});
    if(file===referenceBundle.manifest.thoughtBubbles.atlas)referenceBundle.manifest.thoughtBubbles.frames.forEach((f,frame)=>comparisonCases.push({kind:'bubble',frame,label:f.label}));
    if(file===referenceBundle.manifest.effectClips.areaScanWave.atlas)referenceBundle.manifest.effectClips.areaScanWave.frames.forEach((f,frame)=>comparisonCases.push({kind:'wave',frame,label:'掃描波紋 '+(frame+1)}));
    for(const item of referenceBundle.manifest.mainScreenAssets.items)if(item.file===file)comparisonCases.push({kind:'icon',id:item.id,label:item.name});
    $('#compare-frame').replaceChildren();comparisonCases.forEach((c,i)=>{const op=document.createElement('option');op.value=i;op.textContent=c.label;$('#compare-frame').append(op);});
    const info=manifest.assetOptimization.files.find(f=>f.original===file);$('#compare-info').textContent=info.originalImageSize.join(' × ')+' → '+info.imageSize.join(' × ')+'；'+Math.round(info.beforeBytes/1024)+' → '+Math.round(info.afterBytes/1024)+' KiB。兩側使用相同顯示尺寸、落點與持物比例。';drawAssetComparison();
  }
  $('#compare-load').onclick=async()=>{
    const button=$('#compare-load');button.disabled=true;button.textContent='載入舊版對照資料…';
    try{
      const cfg=manifest.assetOptimization.comparison,res=await Promise.all([fetch('assets/'+cfg.manifest),fetch('assets/'+cfg.alignment)]);if(res.some(r=>!r.ok))throw Error('無法讀取對照資料');
      const [oldManifest,oldAlignment]=await Promise.all(res.map(r=>r.json()));referenceBundle={manifest:oldManifest,align:oldAlignment};comparisonReady=true;
      manifest.assetOptimization.files.forEach(f=>{const option=document.createElement('option');option.value=f.original;option.textContent=f.original;$('#compare-file').append(option);});
      $('#compare-file').value='robot-carry-directions-v06.png';$('#compare-controls').hidden=false;$('#compare-pair').hidden=false;button.hidden=true;compareFileChanged();
    }catch(e){button.disabled=false;button.textContent='重試載入舊版對照';$('#compare-info').textContent=e.message;}
  };
  $('#compare-file').onchange=compareFileChanged;$('#compare-frame').onchange=drawAssetComparison;
  let stuckPreviewElapsed=0,stuckPreviewActive=manifest.assetOptimization.stuckPreview.initiallyStuck;
  function drawStuckPreview(){
    const cfg=manifest.assetOptimization.stuckPreview,canvas=$('#stuck-preview'),ctx=canvas.getContext('2d'),name=stuckPreviewActive?cfg.clip:cfg.resetClip,clip=clips[name],elapsed=stuckPreviewElapsed,total=clip.frameDurationsMs.reduce((s,v)=>s+v,0);let t=clip.loop?elapsed%total:Math.min(elapsed,total-1),step=0;
    while(step<clip.frameOrder.length-1&&t>=clip.frameDurationsMs[step])t-=clip.frameDurationsMs[step++];
    const pose=rendering.robotPoses[clip.poseRows[0]],f=pose.frames[clip.frameOrder[step]],im=imageSource(pose.atlas);ctx.clearRect(0,0,...cfg.canvas);ctx.imageSmoothingEnabled=false;
    if(im.complete&&im.naturalWidth){const [sx,sy,sw,sh]=f.sourceRect,[cx,cy,h]=lookup(f.alignmentPath),u=cfg.robotDisplaySize/alignment.canvas,k=alignment.bodyHeight/h*u,bob=f.bobIndex==null?0:alignment.bob[f.bobIndex];ctx.drawImage(im,sx,sy,sw,sh,cfg.robotBox[0]+alignment.bodyCenter[0]*u-(cx-sx)*k,cfg.robotBox[1]+(alignment.bodyCenter[1]+bob)*u-(cy-sy)*k,sw*k,sh*k);}
    const bubble=thoughts.byClip[name];if(bubble){const frame=thoughtFrame(bubble,elapsed),b=thoughts.frames[frame],bi=imageSource(thoughts.atlas),p=thoughts.placement,k=cfg.robotDisplaySize*p.widthRatio/thoughts.canvas[0],[dx,dy,dw,dh]=b.destinationRect,x=cfg.robotBox[0]+cfg.robotDisplaySize*p.leftRatio,y=cfg.robotBox[1]+cfg.robotDisplaySize*(1-p.bottomRatio)-thoughts.canvas[1]*k;if(bi.complete&&bi.naturalWidth)ctx.drawImage(bi,...b.sourceRect,x+dx*k,y+dy*k,dw*k,dh*k);}
    canvas.dataset.clip=name;canvas.dataset.step=step;$('#stuck-preview-status').textContent=stuckPreviewActive?'當機中・循環至重置':'已重置・恢復待命';
  }
  [$('#stuck-preview').width,$('#stuck-preview').height]=manifest.assetOptimization.stuckPreview.canvas;
  $('#stuck-reset').onclick=()=>{stuckPreviewActive=!stuckPreviewActive;stuckPreviewElapsed=0;$('#stuck-reset').textContent=stuckPreviewActive?manifest.assetOptimization.stuckPreview.resetButtonLabel:manifest.assetOptimization.stuckPreview.startButtonLabel;drawStuckPreview();};
  drawStuckPreview();

  function syncValleyControls(){
    document.querySelectorAll('#valley-views button').forEach(button=>{const active=button.dataset.view===valleyState.view;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    buttons('#valley-soils',valleyState.soil);
  }
  Object.entries(valley.projection.views).forEach(([id,view])=>{
    const button=document.createElement('button');button.dataset.view=id;button.textContent=view.label;$('#valley-views').append(button);
  });
  $('#valley-views').onclick=e=>{if(!e.target.matches('button'))return;valleyState.view=e.target.dataset.view;drawValley();syncValleyControls();};
  $('#valley-soils').onclick=e=>{if(!e.target.matches('button'))return;valleyState.soil=+e.target.dataset.value;drawValley();drawAngledScene();syncValleyControls();};

  $('#boundary-visible').checked=boundary.lab.initialVisible;
  $('#boundary-visible').onchange=()=>drawValley();
  for(const sample of boundary.lab.samples){
    const card=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');
    [canvas.width,canvas.height]=boundary.lab.canvas;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',sample.label+'木樁與繩索外緣及作物遮擋預覽');
    const geometry=boundaryGeometry(sample.cells);
    caption.textContent=sample.label+' ／ '+geometry.edges.length+' 段繩・'+geometry.vertices.length+' 根樁';
    card.append(canvas,caption);$('#boundary-samples').append(card);boundaryViews.set(canvas,sample);drawBoundarySample(canvas,sample);
  }
  drawValley();syncValleyControls();
  function turn(delta){
    if(movement||harvestTarget){$('#status').textContent='請等目前的移動或採收完成再轉向。';return;}
    heading=(heading+delta+directions.length)%directions.length;directionalPose=true;action=idleAction;resetFrame();
    buttons('#actions',idleAction);updateRobot();sync();
    $('#status').textContent='已'+(delta<0?'左':'右')+'轉 90°，面向'+directions[heading].name+'。';
  }
  $('#turn-left').onclick=()=>turn(manifest.movement.turnLeft);$('#turn-right').onclick=()=>turn(manifest.movement.turnRight);
  $('#forward').onclick=()=>{
    if(movement||harvestTarget){$('#status').textContent='請等目前的移動或採收完成。';return;}
    const d=directions[heading],x=selected%scene.columns+d.dx,y=Math.floor(selected/scene.columns)+d.dy;
    if(x<0||x>=scene.columns||y<0||y>=scene.rows){$('#status').textContent='前方已到田區邊界，請先轉向。';return;}
    moveTo(y*scene.columns+x);
  };
  function moveTo(target){
    if(movement||harvestTarget){$('#status').textContent='請等目前的移動或採收完成。';return;}if(target===selected)return;
    let x=selected%scene.columns,y=Math.floor(selected/scene.columns);const tx=target%scene.columns,ty=Math.floor(target/scene.columns),route=[];
    for(const axis of manifest.movement.route.split('-then-')){
      if(axis==='horizontal')while(x!==tx){x+=Math.sign(tx-x);route.push(y*scene.columns+x);}
      if(axis==='vertical')while(y!==ty){y+=Math.sign(ty-y);route.push(y*scene.columns+x);}
    }
    movement={route,from:selected,to:null,elapsed:0};action=idleAction;buttons('#actions',idleAction);startStep();
  }
  function startStep(){
    const to=movement.route.shift();
    if(to===undefined){
      movement=null;directionalPose=false;resetFrame();updateRobot();sync();
      $('#status').textContent='已抵達田區 '+(selected+1)+(cargo?'，仍攜帶 1 個'+produce[cargo.crop].name:'，恢復正面待命')+'。';return;
    }
    const from=selected;movement.from=from;movement.to=to;movement.elapsed=0;
    const dx=Math.sign(to%scene.columns-from%scene.columns),dy=Math.sign(Math.floor(to/scene.columns)-Math.floor(from/scene.columns));
    heading=directions.findIndex(d=>d.dx===dx&&d.dy===dy);
    directionalPose=true;resetFrame();updateRobot();sync();
    $('#status').textContent='向'+directions[heading].name+'移動至田區 '+(to+1)+(paused?'（已暫停）':'')+'。';
  }
  let previousTime=null;
  function animateMovement(time){
    const dt=previousTime===null?0:Math.min(time-previousTime,50);previousTime=time;
    if(!paused&&!document.hidden){thoughtState.elapsedMs+=dt;updateThought();stuckPreviewElapsed+=dt;drawStuckPreview();}
    if(movement&&!paused&&!document.hidden){
      const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?manifest.movement.reducedMotionStepDurationMs:manifest.movement.stepDurationMs;
      movement.elapsed+=dt;const progress=duration?Math.min(movement.elapsed/duration,1):1,from=movement.from,to=movement.to;
      placeBot(from%scene.columns+(to%scene.columns-from%scene.columns)*progress,Math.floor(from/scene.columns)+(Math.floor(to/scene.columns)-Math.floor(from/scene.columns))*progress);
      if(progress===1){selected=to;renderPlots();startStep();}
    }
    requestAnimationFrame(animateMovement);
  }
  function placeBot(x,y){
    const grid=$('#plots'),bot=$('#bot');
    bot.style.left=(grid.offsetLeft+(x+.5)*grid.clientWidth/scene.columns-bot.offsetWidth*.5+scene.robotOffsetX)+'px';
    bot.style.top=(grid.offsetTop+(y+1)*grid.clientHeight/scene.rows-bot.offsetHeight*scene.robotHeightRatio+scene.robotOffsetY)+'px';
  }
  function advanceAnimation(){
    const clip=clips[clipName()],index=frameCursor,before=objectState(clip);
    const next=index+1;
    frameCursor=next<clip.frameOrder.length?next:clip.loop?0:clip.frameOrder.length-1;
    frame=clip.frameOrder[frameCursor];
    let redrawPlants=false;
    if(harvestTarget&&objectState(clip).cargoVisible&&!cargo){cargo={...harvestTarget};redrawPlants=true;}
    if(harvestTarget&&!clip.loop&&frameCursor===clip.frameOrder.length-1){
      harvestTarget=null;
      if(clip.onComplete){frameCursor=0;frame=firstFrame(clip.onComplete);}
      if(cargo)$('#status').textContent='已把 1 個'+produce[cargo.crop].name+'舉到頭上。放下後才能再採收。';
    }
    if(!harvestTarget&&!cargo&&!clip.loop&&next>=clip.frameOrder.length&&clip.onComplete){
      const label=actions[action];action=manifest.playback.actionClips.indexOf(clip.onComplete);resetFrame();buttons('#actions',action);
      $('#status').textContent=label+'展示完成，已回到待機。';
    }
    if(redrawPlants||before.sourcePlantVisible!==objectState().sourcePlantVisible)renderPlots();
    showCargo();sync();updateRobot();
  }
  function scheduleAnimation(){
    const clip=clips[clipName()];
    if(animationTimer!==null)clearTimeout(animationTimer);
    animationTimer=setTimeout(()=>{if(!paused&&!document.hidden)advanceAnimation();scheduleAnimation();},clip.frameDurationsMs?clip.frameDurationsMs[frameCursor]:clip.frameDurationMs);
  }
  const mosaicTiles=[...document.querySelectorAll('.soil-unit')];
  mosaicTiles.forEach((el,i)=>position(el,soilData.lab.previewSoil,0,soilData.lab.previewVariants[i%soilData.lab.previewVariants.length]));
  $('#tile-soils').onclick=e=>{
    if(!e.target.matches('button'))return;const soil=+e.target.dataset.value;
    mosaicTiles.forEach(el=>position(el,soil,0,el.soilFrame.variant));buttons('#tile-soils',soil);
  };
  $('#bot').style.zIndex=rendering.layerZ.robot;$('#held-item').style.zIndex=rendering.layerZ.cargo;
  new ResizeObserver(()=>{if(!movement)placeBot(selected%scene.columns,Math.floor(selected/scene.columns));updateEffects();}).observe($('.greenhouse'));
  renderPlots();sync();buttons('#actions',idleAction);pauseLabel();updateRobot();
  requestAnimationFrame(animateMovement);scheduleAnimation();
})().catch(error=>{
  console.error(error);
  const status=document.querySelector('#status');
  if(status)status.textContent='素材數據載入失敗，請重新整理；本機預覽請使用 HTTP 伺服器。';
});
