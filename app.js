
(async function(){
  const response=await fetch('assets/manifest.json?v=14');
  if(!response.ok)throw new Error('素材數據讀取失敗：'+response.status);
  const manifest=await response.json(),rendering=manifest.rendering,clips=manifest.animationClips;
  const $=s=>document.querySelector(s),alignment=spriteAlignment;
  const robotViews=new Set(),plantViews=new Set(),itemViews=new Set(),soilViews=new Set(),effectViews=new Map(),images=new Map();
  const thoughts=manifest.thoughtBubbles,thoughtViews=new Map();
  const thoughtState={clip:null,elapsedMs:0,frame:null};
  const mainAssets=manifest.mainScreenAssets,mainAssetViews=new Map();
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
    image.onload=()=>{robotViews.forEach(drawRobot);plantViews.forEach(drawPlant);itemViews.forEach(drawItem);soilViews.forEach(drawSoil);effectViews.forEach((view,canvas)=>drawEffect(canvas,view));updateEffects();thoughtViews.forEach((index,canvas)=>drawThought(canvas,index));updateThought(true);mainAssetViews.forEach((item,canvas)=>drawMainAsset(canvas,item));};
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
  [['idle','原版待命'],['sow','播種'],['water','澆水'],['harvest','空手採收'],['scan','範圍掃描'],[manifest.playback.decisionClips.thinking,'判斷燈號']].forEach(([key,label])=>{
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
    if(!paused&&!document.hidden){thoughtState.elapsedMs+=dt;updateThought();}
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
