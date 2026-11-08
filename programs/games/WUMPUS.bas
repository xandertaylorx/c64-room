10 rem *** hunt the wumpus ***
20 poke 53280,0:poke 53281,0:dim ad(20,3),q(3):s=54272:poke s+24,15:poke s+5,9:poke s+6,0
30 for i=1 to 20:for j=1 to 3:read ad(i,j):next:next
40 data 2,5,8,1,3,10,2,4,12,3,5,14,1,4,6,5,7,15,6,8,17,1,7,9,8,10,18,2,9,11
50 data 10,12,19,3,11,13,12,14,20,4,13,15,6,14,16,15,17,20,7,16,18,9,17,19,11,18,20,13,16,19
60 print "{147}{158}":print:print "    H U N T   T H E   W U M P U S":print
70 print "{5}  A HUNGRY WUMPUS LIVES IN A CAVE OF 20"
80 print "  ROOMS. EACH ROOM HAS 3 TUNNELS.":print
90 print "  PITS AND SUPER BATS LURK TOO."
100 print "  YOU HAVE 5 CROOKED ARROWS.":print
110 print "  M = MOVE   S = SHOOT":print
115 print "{158}  PRESS ANY KEY"
120 get k$:if k$="" then 120
130 print "{147}"
140 pl=int(rnd(1)*20)+1:wu=pl
150 if wu=pl then wu=int(rnd(1)*20)+1:goto 150
160 p1=pl
170 p1=int(rnd(1)*20)+1:if p1=pl or p1=wu then 170
180 p2=int(rnd(1)*20)+1:if p2=pl or p2=wu or p2=p1 then 180
190 b1=int(rnd(1)*20)+1:if b1=pl or b1=wu then 190
200 b2=int(rnd(1)*20)+1:if b2=pl or b2=wu or b2=b1 then 200
210 ar=5
220 rem --- start of a turn
230 print "{5}":print "{158}YOU ARE IN ROOM";pl
240 print "{5}TUNNELS LEAD TO";ad(pl,1);ad(pl,2);ad(pl,3)
250 for j=1 to 3:r=ad(pl,j)
260 if r=wu then print "{153}I SMELL A WUMPUS!"
270 if r=p1 or r=p2 then print "{154}I FEEL A DRAFT."
280 if r=b1 or r=b2 then print "{158}BATS NEARBY!"
290 next
300 print "{5}ARROWS:";ar:print "(M)OVE OR (S)HOOT?";
310 get k$:if k$<>"M" and k$<>"S" then 310
320 print k$:if k$="S" then 500
330 print "{5}WHERE TO?";:input t$:t=val(t$)
340 if t<>ad(pl,1) and t<>ad(pl,2) and t<>ad(pl,3) then print "{28}NOT FROM HERE.":goto 330
350 pl=t
360 rem --- hazards
370 if pl=wu then print "{28}...OOPS! BUMPED A WUMPUS!":gosub 700:if dd=1 then 900
380 if pl=p1 or pl=p2 then print "{28}YYYIIIEEEE... FELL IN A PIT!":goto 910
390 if pl=b1 or pl=b2 then print "{158}ZAP! SUPER BAT SNATCH!":pl=int(rnd(1)*20)+1:poke s+4,129:poke s+1,60:goto 360
400 goto 220
500 rem --- shoot
510 print "{5}HOW MANY ROOMS (1-3)?";:input n$:n=val(n$):if n<1 or n>3 then 510
520 for i=1 to n
530 print "{5}ROOM";i;:input r$:q(i)=val(r$)
540 next
545 cu=pl
550 for i=1 to n:ok=0:for j=1 to 3:if ad(cu,j)=q(i) then ok=1
560 next:if ok=0 then q(i)=ad(cu,int(rnd(1)*3)+1)
570 cu=q(i)
580 if cu=wu then print "{153}AHA! YOU GOT THE WUMPUS!":goto 920
590 if cu=pl then print "{28}OUCH! ARROW GOT YOU!":goto 910
600 next
610 ar=ar-1:poke s+4,129:poke s+1,30
620 print "{5}MISSED."
630 gosub 700:if dd=1 then 900
640 if ar=0 then print "{28}OUT OF ARROWS.":goto 910
650 goto 220
700 rem --- wumpus moves 3 times out of 4
710 dd=0:if rnd(1)<.75 then wu=ad(wu,int(rnd(1)*3)+1)
720 if wu=pl then dd=1
730 return
900 print "{28}TSK TSK TSK - WUMPUS GOT YOU!":goto 910
910 print:print "{28}HA HA HA - YOU LOSE!":goto 930
920 print:print "{153}HEE HEE - THE WUMPUS'LL GETCHA NEXT TIME!"
930 print:print "{5}PRESS ANY KEY TO PLAY AGAIN"
940 get k$:if k$="" then 940
945 get k$:if k$="" then 945
950 print "{147}":goto 140
