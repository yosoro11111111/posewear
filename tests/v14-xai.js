// v14: xAI 协议（issue #6）——假上游按 xAI 真实规格严格校验：
// 出现 size / 数组形 image / multipart 一律 400 Argument not supported。
const {chromium}=require('playwright');const path=require('path'),fs=require('fs'),FX=path.join(__dirname,'fixtures')+'/';
const PNG=fs.readFileSync(FX+'mk1.png').toString('base64');
(async()=>{const U=process.env.U||'http://localhost:8787';const b=await chromium.launch({executablePath:process.env.CHROME_PATH});const errs=[],R=[];let mode='ok',hits=[];
 const setup=async proto=>{const c=await b.newContext({viewport:{width:1366,height:900}});const p=await c.newPage();p.on('pageerror',e=>errs.push(e.message));
  await p.route(/\/api\/proxy/,async route=>{const req=route.request();if(req.method()=='OPTIONS')return route.fulfill({status:204});
   const target=req.headers()['x-target-url']||'';let body=null;try{body=JSON.parse(req.postData()||'null')}catch(e){}
   hits.push({target,body,ct:req.headers()['content-type']||''});
   const H={'content-type':'application/json','access-control-allow-origin':'*'};
   if(mode=='argerr')return route.fulfill({status:400,headers:H,body:JSON.stringify({error:{message:'Argument not supported: size'}})});
   if((req.headers()['content-type']||'').includes('multipart'))return route.fulfill({status:400,headers:H,body:JSON.stringify({error:{message:'Argument not supported: multipart'}})});
   if(body&&'size' in body)return route.fulfill({status:400,headers:H,body:JSON.stringify({error:{message:'Argument not supported: size'}})});
   if(body&&Array.isArray(body.image))return route.fulfill({status:400,headers:H,body:JSON.stringify({error:{message:'Argument not supported: image'}})});
   return route.fulfill({status:200,headers:H,body:JSON.stringify({data:[{b64_json:PNG}]})})});
  await p.addInitScript(pr=>{if(!sessionStorage.x){sessionStorage.x=1;localStorage.setItem('wbCfg',JSON.stringify({prov:'custom',key:'xai-test-key',base:'https://api.x.ai',model:'grok-imagine-image-2.0',field:'image[]',proto:pr,proxy:true}));localStorage.setItem('introX','1')}window.__TMO=8000},proto);
  await p.goto(U+'/#studio');await p.waitForFunction(()=>window.WB&&window.APP,null,{timeout:15000});
  await p.setInputFiles('#wbFile',FX+'person.png');
  await p.evaluate(async()=>{await APP.load('costume');const k=Object.keys(APP.ITEMS).find(k=>APP.ITEMS[k].type=='costume');await WB.pick(APP.ITEMS[k])});
  await p.waitForFunction(()=>!document.querySelector('#wbGo').disabled,null,{timeout:15000});return{c,p}};
 const go=async p=>{await p.click('#wbGo');await p.waitForFunction(()=>document.querySelector('#wbBusy').hidden,null,{timeout:20000}).catch(()=>{});await p.waitForTimeout(300)};
 const st=p=>p.evaluate(()=>({res:(document.querySelector('#wbAfter').src||'').slice(0,5),err:document.querySelector('#wbErr').hidden?'':document.querySelector('#wbErr').innerText.replace(/\s+/g,' ')}));

 // 1) xAI 协议 + 自动画幅：出图；body 无 size/aspect_ratio；参考图走 images:[{url:data:}]；端点 edits
 hits=[];mode='ok';{const{c,p}=await setup('xai');await go(p);const s=await st(p);const h=hits[0]||{},bd=h.body||{};
  R.push(['xai success',s.res=='blob:'&&!s.err,JSON.stringify(s)]);
  R.push(['xai endpoint edits',/\/v1\/images\/edits$/.test(h.target),h.target]);
  R.push(['xai no size / no aspect on auto',!('size' in bd)&&!('aspect_ratio' in bd),JSON.stringify(Object.keys(bd))]);
  R.push(['xai images shape',Array.isArray(bd.images)&&bd.images.length==2&&bd.images.every(x=>/^data:image\//.test(x.url||'')),JSON.stringify(bd.images&&bd.images.length)]);
  R.push(['xai b64_json',bd.response_format=='b64_json',bd.response_format||'']);await c.close()}
 // 2) xAI 协议 + 9:16：aspect_ratio 直传
 hits=[];{const{c,p}=await setup('xai');await p.selectOption('#wbAR','9:16');await go(p);const bd=(hits[0]||{}).body||{};
  R.push(['xai aspect 9:16',bd.aspect_ratio=='9:16'&&!('size' in bd),JSON.stringify(bd.aspect_ratio)]);await c.close()}
 // 3) 误选 edits 协议撞 Argument not supported：不三连重试（hits==1），文案定向提示
 hits=[];mode='argerr';{const{c,p}=await setup('edits');await go(p);const s=await st(p);
  R.push(['argerr no triple retry',hits.length==1,'hits '+hits.length]);
  R.push(['argerr targeted msg',/不支持 size 参数/.test(s.err),s.err.slice(0,110)]);await c.close()}
 let fail=0;for(const[n,ok,d]of R){console.log((ok?'PASS':'FAIL')+' '+n+(ok?'':' — '+d));if(!ok)fail++}
 console.log('errors',JSON.stringify(errs));if(errs.length)fail++;
 process.exit(fail?1:0)})().catch(e=>{console.error(e);process.exit(2)});
