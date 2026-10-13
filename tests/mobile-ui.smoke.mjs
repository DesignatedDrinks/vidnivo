/* Mobile browser smoke test. Node 22 + Playwright/Chromium. */
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {join,extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root=resolve(fileURLToPath(new URL('../docs/',import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const wanted=pathname==='/'?'index.html':decodeURIComponent(pathname).replace(/^\/+/,'');
 const abs=resolve(root,wanted);
 if(!abs.startsWith(root+'/')&&abs!==join(root,'index.html')){
  res.writeHead(403);res.end();return;
 }
 try{
  if(!(await stat(abs)).isFile())throw Error('not a file');
  res.setHeader('Content-Type',mime[extname(abs)]||'application/octet-stream');
  res.end(await readFile(abs));
 }catch{res.writeHead(404);res.end('Not found')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,
 isMobile:true,hasTouch:true});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.locator('#mobileBottomNav').waitFor({state:'visible'});
 await page.locator('#mobileExport').waitFor({state:'visible'});
 await page.locator('#mobileTimelineScroll').waitFor({state:'visible'});
 const navBox=await page.locator('#mobileBottomNav').boundingBox();
 const previewBox=await page.locator('#previewWrap').boundingBox();
 const timelineBox=await page.locator('#mobileTimelineScroll').boundingBox();
 assert.ok(navBox&&navBox.y>700,'Bottom navigation should be at screen bottom');
 assert.ok(previewBox&&previewBox.height>240,'Portrait preview should be prominent');
 assert.ok(timelineBox&&timelineBox.y>previewBox.y,'Timeline should follow preview');
 await page.locator('[data-mobile-tool="captions"]').click();
 await page.locator('#rb-font').waitFor({state:'visible'});
 assert.ok(await page.locator('#rb-font option').count()>=24,'Font picker missing styles');
 await page.locator('#rb-font').selectOption('anton');
 const font=await page.locator('#rb-font-preview').evaluate(node=>getComputedStyle(node).fontFamily);
 assert.match(font,/Anton/i);
 await page.locator('#mobileDrawerBackdrop').click({position:{x:10,y:30}});
 await page.locator('[data-mobile-tool="generate"]').click();
 assert.ok(await page.locator('.rb-tools').isVisible(),'Generate drawer did not open');
 await page.screenshot({path:'/tmp/rollblink-mobile-smoke.png',fullPage:true});
 assert.deepEqual(errors,[],'Mobile browser runtime errors');
 process.stdout.write('Mobile editor smoke test passed.\n');

 const desktop=await browser.newPage({viewport:{width:1366,height:900},deviceScaleFactor:1});
 const desktopErrors=[];
 desktop.on('pageerror',error=>desktopErrors.push(error.message));
 try{
  await desktop.goto(base,{waitUntil:'domcontentloaded'});
  await desktop.locator('#mobileBottomNav').waitFor({state:'visible'});
  await desktop.locator('#mobileTimelineScroll').waitFor({state:'visible'});
  const appDisplay=await desktop.locator('.app').evaluate(el=>getComputedStyle(el).display);
  assert.equal(appDisplay,'flex','Desktop must use redesigned stacked editing shell');
  const dPreview=await desktop.locator('#previewWrap').boundingBox();
  const dTimeline=await desktop.locator('#mobileTimelineScroll').boundingBox();
  const dNav=await desktop.locator('#mobileBottomNav').boundingBox();
  assert.ok(dPreview&&dPreview.height>300,'Desktop must feature portrait preview');
  assert.ok(dTimeline&&dTimeline.y>dPreview.y,'Desktop timeline should be below preview');
  assert.ok(dNav&&dNav.y>800,'Desktop bottom editing toolbar must be visible');
  await desktop.locator('[data-mobile-tool="captions"]').click();
  await desktop.locator('#rb-font').waitFor({state:'visible'});
  assert.equal(await desktop.locator('#rb-font option').count(),24);
  await desktop.screenshot({path:'/tmp/rollblink-desktop-smoke.png',fullPage:true});
  assert.deepEqual(desktopErrors,[],'Desktop browser runtime errors');
  process.stdout.write('Desktop editor smoke test passed.\n');
 }finally{await desktop.close()}

}finally{
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
