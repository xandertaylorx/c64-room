10 rem *** breakout ***
20 v=53248:s=54272:hi=0:poke 53280,0:poke 53281,0
30 for i=0 to 24:poke s+i,0:next:poke s+24,15:poke s+5,9:poke s+6,0
40 for i=0 to 62:poke 832+i,0:poke 896+i,0:next
50 for r=7 to 14:poke 832+r*3+1,255:next
60 for r=0 to 3:poke 896+r*3,255:poke 896+r*3+1,255:poke 896+r*3+2,255:next
70 poke 2040,13:poke 2041,14:poke v+39,1:poke v+40,13:poke v+29,2
80 print "{147}{158}":print:print:print "       B R E A K O U T"
90 print:print "{5}   A / D, CURSOR RIGHT OR JOYSTICK"
100 print "   MOVE THE PADDLE. BREAK ALL THE BRICKS."
110 print:print "{158}   PRESS ANY KEY"
120 get k$:if k$="" then 120
130 sc=0:li=3:lv=1
140 gosub 900
150 px=150:bx=px+20:by=222:vx=3:vy=-4:poke v+21,3:gosub 800
160 tt=ti+45
170 if ti<tt then 170
200 rem --- main loop
210 tt=ti+2
220 k=peek(197):j=peek(56320)
230 if k=10 or k=34 or (j and 4)=0 then px=px-8
240 if k=18 or k=42 or k=2 or (j and 8)=0 then px=px+8
250 if px<24 then px=24
260 if px>296 then px=296
270 bx=bx+vx:by=by+vy
280 if bx<24 then bx=24:vx=-vx
290 if bx>330 then bx=330:vx=-vx
300 if by<56 then by=56:vy=-vy:gosub 600
310 if vy>0 and by>=222 and by<=232 and bx+8>=px and bx<=px+48 then vy=-vy:vx=int((bx+4-px-24)/6):if vx=0 then vx=1
315 if vy<0 and vx=0 then vx=1
320 if by>248 then 500
330 cx=int((bx+4-24)/8):cy=int((by+4-50)/8):q=1024+cy*40+cx
340 if cy<1 or cy>9 or cx<0 or cx>39 then 380
350 if peek(q)<>160 then 380
360 poke q,32:vy=-vy:sc=sc+(10-cy)*5:bk=bk-1:gosub 610:gosub 850
370 if bk=0 then 450
380 gosub 800
390 if ti<tt then 390
400 goto 210
450 lv=lv+1:poke v+21,0:gosub 900:goto 150
500 li=li-1:gosub 620:poke v+21,0:gosub 850
510 if li>0 then 150
520 if sc>hi then hi=sc
530 poke 781,12:poke 782,15:poke 783,0:sys 65520:print "{18}{28} GAME OVER {146}"
540 poke 781,14:poke 782,7:poke 783,0:sys 65520:print "{5}PRESS A KEY TO PLAY AGAIN"
550 tt=ti+60
560 if ti<tt then 560
570 get k$:if k$<>"" then 570
580 get k$:if k$="" then 580
590 print "{147}":goto 130
600 poke s+4,16:poke s+1,20:poke s+4,17:return
610 poke s+4,16:poke s+1,40+cy*2:poke s+4,17:return
620 poke s+4,128:poke s+1,6:poke s+4,129:return
800 poke v,bx and 255:poke v+1,by:poke v+2,px and 255:poke v+3,230
810 m=0:if bx>255 then m=1
815 if px>255 then m=m+2
820 poke v+16,m:return
850 print "{19}{5} SCORE";sc;" HI";hi;" LIVES";li;" LV";lv;" ":return
900 print "{147}":bk=0
910 for r=2 to 7:cl=val(mid$("287536",r-1,1)):for c=1 to 38:poke 1024+r*40+c,160:poke 55296+r*40+c,cl:bk=bk+1:next:next
920 gosub 850:return
