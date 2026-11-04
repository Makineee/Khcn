// Robot Lab relay server: serves /public and relays messages between the host screen and 2 phone controllers.
const http=require('http'),fs=require('fs'),path=require('path'),{WebSocketServer}=require('ws');
const PORT=process.env.PORT||3000;
// Serve /public if it exists, otherwise the same folder as server.js (only .html files then)
const HASPUB=fs.existsSync(path.join(__dirname,'public')),PUB=HASPUB?path.join(__dirname,'public'):__dirname;
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
const ALLOW=HASPUB?null:['.html','.mp3'];
const srv=http.createServer((req,res)=>{
  let u=decodeURIComponent(req.url.split('?')[0]);if(u==='/')u='/index.html';
  const f=path.join(PUB,path.normalize(u)),ext=path.extname(f);
  if(!f.startsWith(PUB)||(ALLOW&&!ALLOW.includes(ext))){res.writeHead(403);return res.end();}
  fs.stat(f,(e,st)=>{if(e||!st.isFile()){res.writeHead(404);return res.end('Not found');}
    const type=MIME[ext]||'application/octet-stream',r=req.headers.range&&/bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if(r){let a=r[1]?+r[1]:0,b=r[2]?+r[2]:st.size-1;if(!r[1]&&r[2]){a=Math.max(0,st.size-+r[2]);b=st.size-1;}
      if(a>b||b>=st.size){res.writeHead(416,{'Content-Range':'bytes */'+st.size});return res.end();}
      res.writeHead(206,{'Content-Type':type,'Content-Range':`bytes ${a}-${b}/${st.size}`,'Accept-Ranges':'bytes','Content-Length':b-a+1});
      return fs.createReadStream(f,{start:a,end:b}).pipe(res);}
    res.writeHead(200,{'Content-Type':type,'Content-Length':st.size,'Accept-Ranges':'bytes'});fs.createReadStream(f).pipe(res);});
});
const wss=new WebSocketServer({server:srv});
let host=null;const ctl=[null,null],last=[null,null];
const send=(s,o)=>{if(s&&s.readyState===1)s.send(JSON.stringify(o));};
const players=()=>send(host,{type:'players',on:ctl.map(c=>!!c)});
wss.on('connection',ws=>{
  ws.alive=true;ws.on('pong',()=>ws.alive=true);
  ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return}
    if(m.type==='host'){host=ws;ws.role='host';players();}
    else if(m.type==='join'&&(m.team===0||m.team===1)){
      const t=m.team,old=ctl[t];if(old&&old!==ws){old.role=null;old.close();}
      ws.role='c';ws.team=t;ctl[t]=ws;send(ws,{type:'s',msg:last[t]||{k:'wait'}});players();}
    else if(m.type==='c'&&ws.role==='c')send(host,{type:'c',team:ws.team,msg:m.msg});
    else if(m.type==='to'&&ws===host)[0,1].forEach(t=>{if(m.team==='all'||m.team===t){last[t]=m.msg;send(ctl[t],{type:'s',msg:m.msg});}});
  });
  ws.on('close',()=>{if(ws===host)host=null;if(ws.role==='c'&&ctl[ws.team]===ws){ctl[ws.team]=null;players();}});
});
setInterval(()=>wss.clients.forEach(ws=>{if(!ws.alive)return ws.terminate();ws.alive=false;ws.ping();}),20000);
srv.listen(PORT,()=>console.log('Robot Lab running on http://localhost:'+PORT));
