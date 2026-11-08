10 rem *** snake ***
20 poke 53280,0:poke 53281,0:s=54272:hi=0:dim x(1023),y(1023)
30 for i=0 to 24:poke s+i,0:next:poke s+24,15:poke s+5,9:poke s+6,0:poke s+12,9:poke s+13,0
40 print "{147}{158}":print:print:print
50 print "{28}      * * *  S N A K E  * * *":print:print
60 print "{5}   STEER WITH W A S D OR A JOYSTICK"
70 print "{5}   EAT THE {28}HEARTS{5} TO GROW AND SCORE."
80 print "{5}   HIT A WALL OR YOURSELF AND IT'S OVER."
90 print:print "{159}   HIGH SCORE:";hi
100 print:print "{158}   PRESS ANY KEY TO START"
110 get k$:if k$="" then 110
120 print "{147}":poke 53280,0
130 for i=0 to 39:poke 1064+i,160:poke 55336+i,11:poke 1984+i,160:poke 56256+i,11:next
140 for i=1 to 24:poke 1024+i*40,160:poke 55296+i*40,11:poke 1063+i*40,160:poke 55335+i*40,11:next
150 h=2:t=0:l=3:x(0)=10:y(0)=12:x(1)=11:y(1)=12:x(2)=12:y(2)=12:dx=1:dy=0:sc=0:sp=7
160 for i=0 to 2:q=1024+y(i)*40+x(i):poke q,81:poke q+54272,5:next
170 q=1024+y(2)*40+x(2):poke q,160:poke q+54272,13
180 gosub 700:gosub 800
200 tt=ti+sp:nx=dx:ny=dy
210 get k$:if k$="" then 260
220 if k$="W" and dy=0 then nx=0:ny=-1
230 if k$="S" and dy=0 then nx=0:ny=1
240 if k$="A" and dx=0 then nx=-1:ny=0
250 if k$="D" and dx=0 then nx=1:ny=0:goto 210
255 goto 210
260 j=peek(56320)
262 if (j and 1)=0 and dy=0 then nx=0:ny=-1
263 if (j and 2)=0 and dy=0 then nx=0:ny=1
264 if (j and 4)=0 and dx=0 then nx=-1:ny=0
265 if (j and 8)=0 and dx=0 then nx=1:ny=0
270 dx=nx:dy=ny
280 ax=x(h)+dx:ay=y(h)+dy:c=peek(1024+ay*40+ax)
285 if c<>32 and c<>83 then 400
290 q=1024+y(h)*40+x(h):poke q,81:poke q+54272,5
295 h=(h+1) and 1023:x(h)=ax:y(h)=ay:q=1024+ay*40+ax:poke q,160:poke q+54272,13
300 if c=83 then sc=sc+10:l=l+1:sp=7-int(sc/60):if sp<3 then sp=3
305 if c=83 then gosub 600:gosub 700:gosub 800:goto 330
310 q=1024+y(t)*40+x(t):poke q,32:t=(t+1) and 1023
330 if ti<tt then 330
340 goto 200
400 poke s+4,128:poke s+1,6:poke s+4,129:poke 53280,2
410 if sc>hi then hi=sc
420 poke 781,11:poke 782,13:poke 783,0:sys 65520
430 print "{18}{28} GAME OVER {146}"
440 poke 781,13:poke 782,7:poke 783,0:sys 65520:print "{5}PRESS A KEY TO PLAY AGAIN"
450 tt=ti+50
460 if ti<tt then 460
470 get k$:if k$<>"" then 470
480 get k$:if k$="" then 480
490 poke s+4,128:goto 120
600 poke s+4,16:poke s,0:poke s+1,48:poke s+4,17:return
700 fx=int(rnd(1)*38)+1:fy=int(rnd(1)*22)+2:if peek(1024+fy*40+fx)<>32 then 700
710 poke 1024+fy*40+fx,83:poke 55296+fy*40+fx,2:return
800 poke 1024,32:print "{19}{5} SCORE";sc;" HI";hi;" LEN";l;"  ":return
