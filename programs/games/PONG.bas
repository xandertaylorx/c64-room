10 rem *** pong ***
20 v=53248:s=54272:poke 53280,0:poke 53281,0
30 for i=0 to 24:poke s+i,0:next:poke s+24,15:poke s+5,9:poke s+6,0
40 for i=0 to 62:poke 832+i,0:poke 896+i,0:next
50 for r=7 to 14:poke 832+r*3+1,255:next
60 for r=0 to 20:poke 896+r*3+1,60:next
70 poke 2040,13:poke 2041,14:poke 2042,14
80 poke v+39,1:poke v+40,5:poke v+41,5:poke v+29,0:poke v+23,6
90 print "{147}{158}":print:print:print "         P O N G"
100 print:print "{5}   W / S OR JOYSTICK MOVES YOUR PADDLE"
110 print "   FIRST TO 7 POINTS WINS":print:print "{158}   PRESS ANY KEY"
120 get k$:if k$="" then 120
130 ps=0:cs=0:gosub 700
140 bx=170:by=150:vx=4:vy=2:if rnd(1)<.5 then vx=-4
150 py=130:cy=130:poke v+21,7
160 rem --- main loop
170 tt=ti+2
180 k=peek(197):j=peek(56320)
190 if k=9 or (j and 1)=0 then py=py-6
200 if k=13 or (j and 2)=0 then py=py+6
210 if py<54 then py=54
220 if py>200 then py=200
230 if cy+16<by then cy=cy+3
240 if cy+16>by then cy=cy-3
250 if cy<54 then cy=54
260 if cy>200 then cy=200
270 bx=bx+vx:by=by+vy
280 if by<54 then by=54:vy=-vy:gosub 600
290 if by>236 then by=236:vy=-vy:gosub 600
300 if vx<0 and bx<=40 and bx>=28 and by>py-8 and by<py+42 then vx=-vx+1:vy=int((by-py-17)/5):gosub 610
310 if vx>0 and bx>=300 and bx<=312 and by>cy-8 and by<cy+42 then vx=-vx-1:vy=int((by-cy-17)/5):gosub 610
315 if vx>11 then vx=11
316 if vx<-11 then vx=-11
320 if bx<12 then cs=cs+1:gosub 620:goto 400
330 if bx>335 then ps=ps+1:gosub 620:goto 400
340 gosub 800
350 if ti<tt then 350
360 goto 170
400 gosub 700:if ps=7 or cs=7 then 500
410 bx=170:by=150:vx=4:vy=2:if rnd(1)<.5 then vx=-4
420 poke v+21,7:tt=ti+40
430 if ti<tt then 430
440 goto 170
500 poke v+21,0:print "{19}";:poke 781,11:poke 782,12:poke 783,0:sys 65520
510 if ps=7 then print "{5}{18} YOU WIN! {146}"
520 if cs=7 then print "{28}{18} CPU WINS {146}"
530 poke 781,13:poke 782,8:poke 783,0:sys 65520:print "{5}PRESS A KEY TO PLAY AGAIN"
540 tt=ti+60
550 if ti<tt then 550
560 get k$:if k$<>"" then 560
570 get k$:if k$="" then 570
580 print "{147}":goto 130
600 poke s+4,16:poke s+1,24:poke s+4,17:return
610 poke s+4,16:poke s+1,34:poke s+4,17:return
620 poke s+4,128:poke s+1,5:poke s+4,129:return
700 print "{147}{5}";:poke 781,0:poke 782,8:poke 783,0:sys 65520
710 print "YOU";ps;"              CPU";cs
720 for r=3 to 24 step 2:poke 1024+r*40+20,93:poke 55296+r*40+20,11:next:return
800 poke v,bx and 255:poke v+1,by:poke v+2,30:poke v+3,py:poke v+4,314 and 255:poke v+5,cy
810 m=0:if bx>255 then m=1
820 poke v+16,m+4:return
