const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const path=require('path');
const app=express(), server=http.createServer(app), io=new Server(server);
const rooms=new Map();

app.use(express.static(path.join(__dirname,'../client')));
app.get('/health',(req,res)=>res.json({ok:true,rooms:rooms.size}));

function getRoom(code){
  if(!rooms.has(code)) rooms.set(code,{players:new Map(),scores:new Map()});
  return rooms.get(code);
}
io.on('connection',socket=>{
  socket.on('join',({room,name})=>{
    room=String(room||'DEMO').slice(0,12).toUpperCase();
    const r=getRoom(room);
    if(r.players.size>=2){socket.emit('full');return;}
    const spawn=r.players.size===0?{x:-5,y:1.5,z:0}:{x:5,y:1.5,z:0};
    const player={id:socket.id,name:String(name||'Player').slice(0,16),...spawn,ry:0,hp:100};
    r.players.set(socket.id,player); r.scores.set(socket.id,0);
    socket.data.room=room;
    socket.join(room);
    socket.emit('joined',{id:socket.id,room});
    io.to(room).emit('state',{players:[...r.players.values()]});
  });
  socket.on('move',data=>{
    const room=socket.data.room;if(!room)return;
    const p=rooms.get(room)?.players.get(socket.id);if(!p)return;
    p.x=Math.max(-9,Math.min(9,Number(data.x)||0));
    p.z=Math.max(-6,Math.min(6,Number(data.z)||0));
    p.ry=Number(data.ry)||0;
    io.to(room).emit('state',{players:[...rooms.get(room).players.values()]});
  });
  socket.on('shoot',()=>{
    const room=socket.data.room;if(!room)return;
    const r=rooms.get(room), shooter=r.players.get(socket.id); if(!shooter)return;
    // Prototype hit validation: short-range cone in front of shooter.
    for(const [id,target] of r.players){
      if(id===socket.id)continue;
      const dx=target.x-shooter.x,dz=target.z-shooter.z,dist=Math.hypot(dx,dz);
      const fx=-Math.sin(shooter.ry),fz=-Math.cos(shooter.ry);
      const dot=(dx*fx+dz*fz)/(dist||1);
      if(dist<7 && dot>0.78){
        target.hp-=25;
        if(target.hp<=0){
          r.scores.set(socket.id,(r.scores.get(socket.id)||0)+1);
          target.hp=100; target.x=target.x>0?-5:5; target.z=0;
          io.to(room).emit('score',{scores:Object.fromEntries(r.scores)});
        }
      }
    }
    io.to(room).emit('state',{players:[...r.players.values()]});
  });
  socket.on('disconnect',()=>{
    const room=socket.data.room;if(!room)return;
    const r=rooms.get(room); if(!r)return;
    r.players.delete(socket.id);r.scores.delete(socket.id);
    io.to(room).emit('state',{players:[...r.players.values()]});
    if(r.players.size===0)rooms.delete(room);
  });
});
server.listen(process.env.PORT||3000,()=>console.log('Sky Blaster server running'));
