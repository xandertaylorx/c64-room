10 rem *** space raid ***
20 s=54272:hi=0:poke 53280,0:poke 53281,0
30 for i=0 to 24:poke s+i,0:next:poke s+24,15:poke s+5,9:poke s+6,0
40 dim al(4,7),cl(4):cl(0)=2:cl(1)=8:cl(2)=7:cl(3)=5:cl(4)=14
50 print "{147}{158}":print:print:print "       S P A C E   R A I D"
60 print:print "{5}   A / D OR JOYSTICK TO MOVE"
70 print "   SPACE OR FIRE TO SHOOT"
80 print "   STOP THE ALIENS REACHING THE GROUND."
90 print:print "{158}   PRESS ANY KEY"
100 get k$:if k$="" then 100
110 sc=0:li=3:lv=1
120 gosub 900
130 rem --- main loop
140 tt=ti+2:n=n+1
150 k=peek(197):j=peek(56320)
160 if k=10 or (j and 4)=0 then if pl>1 then poke 1024+23*40+pl,32:pl=pl-1
170 if k=18 or (j and 8)=0 then if pl<38 then poke 1024+23*40+pl,32:pl=pl+1
180 poke 1024+23*40+pl,30:poke 55296+23*40+pl,5
190 if (k=60 or (j and 16)=0) and by=0 then by=22:bxx=pl:gosub 600
200 if by>0 then gosub 300
210 if n>=sp then n=0:gosub 400
220 gosub 500
230 if ti<tt then 230
240 goto 140
300 rem --- move bullet
310 poke 1024+by*40+bxx,32
320 by=by-1:if by<1 then by=0:return
330 c=peek(1024+by*40+bxx)
340 if c=88 then gosub 350:by=0:return
345 poke 1024+by*40+bxx,94:poke 55296+by*40+bxx,7:return
350 rem hit an alien: find it
360 cc=int((bxx-ax)/3):rr=int((by-ay)/2)
365 if cc<0 or cc>7 or rr<0 or rr>4 then return
370 if al(rr,cc)=0 then return
380 al(rr,cc)=0:q=1024+(ay+rr*2)*40+ax+cc*3:poke q,32:poke q+1,32:poke 1024+by*40+bxx,32:sc=sc+(5-rr)*10:na=na-1:gosub 610:gosub 850
390 if na=0 then 450
395 return
400 rem --- move the alien block
410 for r=0 to 4:for c=0 to 7:if al(r,c)=1 then q=1024+(ay+r*2)*40+ax+c*3:poke q,32:poke q+1,32
415 next:next
420 ax=ax+dr
430 if ax<1 or ax+22>38 then dr=-dr:ax=ax+dr:ay=ay+1:gosub 620
435 if ay+8>=22 then 700
440 gosub 800:return
450 lv=lv+1:sc=sc+100:gosub 900:goto 140
500 rem --- bombs
510 if rnd(1)<.05 and bm=0 then bm=1:bc=int(rnd(1)*8):bw=ax+bc*3:bt=ay+10
520 if bm=0 then return
525 if n and 1 then return
530 poke 1024+bt*40+bw,32:bt=bt+1
540 if bt>=23 then bm=0:if bw=pl then 700
545 if bt>=23 then return
550 poke 1024+bt*40+bw,58:poke 55296+bt*40+bw,2:return
600 poke s+4,16:poke s+1,60:poke s+4,17:return
610 poke s+4,128:poke s+1,9:poke s+4,129:return
620 poke s+4,16:poke s+1,12:poke s+4,17:return
700 rem --- player hit
710 li=li-1:poke s+4,128:poke s+1,4:poke s+4,129:poke 53280,2
720 tt=ti+50
730 if ti<tt then 730
740 poke 53280,0:bm=0:by=0:bt=0
750 if li>0 then print "{147}":gosub 850:goto 770
760 goto 1000
775 ay=ay-2:if ay<2 then ay=2
780 pl=19:gosub 800:goto 140
800 for r=0 to 4:for c=0 to 7:if al(r,c)=1 then gosub 810
805 next:next:return
810 q=1024+(ay+r*2)*40+ax+c*3:poke q,88:poke q+1,88:poke q+54272,cl(r):poke q+54273,cl(r):return
850 print "{19}{5} SCORE";sc;" HI";hi;" LIVES";li;" WAVE";lv;" ":return
900 print "{147}":ax=3:ay=2:dr=1:na=40:by=0:bm=0:pl=19:sp=14-lv:if sp<4 then sp=4
910 for r=0 to 4:for c=0 to 7:al(r,c)=1:next:next
920 gosub 800:gosub 850:return
1000 if sc>hi then hi=sc
1010 poke 781,11:poke 782,14:poke 783,0:sys 65520:print "{18}{28} GAME OVER {146}"
1020 poke 781,13:poke 782,7:poke 783,0:sys 65520:print "{5}PRESS A KEY TO PLAY AGAIN"
1030 tt=ti+60
1040 if ti<tt then 1040
1050 get k$:if k$<>"" then 1050
1060 get k$:if k$="" then 1060
1070 print "{147}":goto 110
