10 rem *** blockfall ***
20 s=54272:hi=0:poke 53280,0:poke 53281,0:x0=15:y0=2
30 for i=0 to 24:poke s+i,0:next:poke s+24,15:poke s+5,9:poke s+6,0
40 dim bx(6,3),by(6,3),cx(3),cy(3),pc(6)
50 for p=0 to 6:for i=0 to 3:read bx(p,i),by(p,i):next:read pc(p):next
60 data -1,0,0,0,1,0,2,0,3
70 data 0,0,1,0,0,1,1,1,7
80 data -1,0,0,0,1,0,0,1,4
90 data 0,0,1,0,-1,1,0,1,5
100 data -1,0,0,0,0,1,1,1,2
110 data -1,0,0,0,1,0,1,1,6
120 data -1,0,0,0,1,0,-1,1,8
130 print "{147}{158}":print:print:print "      B L O C K F A L L"
140 print:print "{5}   A / D MOVE      W ROTATE"
150 print "   S SOFT DROP   SPACE HARD DROP"
160 print "   JOYSTICK: FIRE ROTATES"
170 print:print "{159}   HIGH SCORE:";hi
180 print:print "{158}   PRESS ANY KEY"
190 get k$:if k$="" then 190
200 gosub 900
210 gt=ti+dl:jt=0
220 get k$:j=peek(56320)
230 if k$="A" then dx=-1:gosub 400
240 if k$="D" then dx=1:gosub 400
250 if k$="W" then gosub 450
260 if k$="S" then gosub 500:gt=ti+dl
270 if k$=" " then gosub 520
280 if ti>=jt then jt=ti+4:gosub 300
290 if ti>=gt then gosub 500:gt=ti+dl
295 goto 220
300 if (j and 4)=0 then dx=-1:gosub 400
310 if (j and 8)=0 then dx=1:gosub 400
320 if (j and 16)=0 and fr=0 then fr=1:gosub 450
325 if (j and 16)<>0 then fr=0
330 if (j and 2)=0 then gosub 500:gt=ti+dl
340 return
400 gosub 680:ox=ox+dx:gosub 550:gosub 600:if f=0 then ox=ox-dx:gosub 550
410 gosub 650:return
450 if p=1 then return
455 gosub 680:r=(r+1) and 3:gosub 550:gosub 600:if f=1 then 470
460 ox=ox+1:gosub 550:gosub 600:if f=1 then 470
462 ox=ox-2:gosub 550:gosub 600:if f=1 then 470
464 ox=ox+1:r=(r+3) and 3:gosub 550
470 gosub 650:return
500 gosub 680:oy=oy+1:gosub 550:gosub 600:if f=1 then gosub 650:return
510 oy=oy-1:gosub 550:gosub 650:gosub 610:gosub 750:gosub 700:return
520 gosub 680
525 oy=oy+1:gosub 550:gosub 600:if f=1 then sc=sc+1:goto 525
530 oy=oy-1:gosub 550:gosub 650:gosub 610:gosub 750:gosub 700:return
550 for i=0 to 3:x=bx(p,i):y=by(p,i):if r>0 then for k=1 to r:t=x:x=-y:y=t:next
555 cx(i)=ox+x:cy(i)=oy+y:next:return
600 f=1:for i=0 to 3:if peek(1024+cy(i)*40+cx(i))<>32 then f=0
605 next:return
610 poke s+4,16:poke s+1,12:poke s+4,17:return
650 for i=0 to 3:poke 1024+cy(i)*40+cx(i),160:poke 55296+cy(i)*40+cx(i),pc(p):next:return
680 for i=0 to 3:poke 1024+cy(i)*40+cx(i),32:next:return
700 p=nx:nx=int(rnd(1)*7):r=0:ox=x0+4:oy=y0+1
705 gosub 550:gosub 600:if f=0 then 1000
710 gosub 650
720 for yy=5 to 8:for xx=29 to 36:poke 1024+yy*40+xx,32:next:next
730 for i=0 to 3:poke 1024+(6+by(nx,i))*40+32+bx(nx,i),160:poke 55296+(6+by(nx,i))*40+32+bx(nx,i),pc(nx):next
740 return
750 n=0:y=y0+19
760 fl=1:for xx=x0 to x0+9:if peek(1024+y*40+xx)=32 then fl=0
765 next
770 if fl=0 then y=y-1:goto 790
775 n=n+1:for yy=y to y0+1 step -1:for xx=x0 to x0+9
777 poke 1024+yy*40+xx,peek(1024+(yy-1)*40+xx):poke 55296+yy*40+xx,peek(55296+(yy-1)*40+xx):next:next
780 for xx=x0 to x0+9:poke 1024+y0*40+xx,32:next
790 if y>=y0 then 760
795 if n=0 then return
800 li=li+n:sc=sc+n*n*100*lv:lv=int(li/10)+1:dl=30-lv*3:if dl<4 then dl=4
805 poke s+4,16:poke s+1,40:poke s+4,17
810 gosub 950:return
900 print "{147}":sc=0:li=0:lv=1:dl=27:nx=int(rnd(1)*7)
910 for y=y0 to y0+19:poke 1024+y*40+x0-1,160:poke 55296+y*40+x0-1,11:poke 1024+y*40+x0+10,160:poke 55296+y*40+x0+10,11:next
920 for xx=x0-1 to x0+10:poke 1024+(y0+20)*40+xx,160:poke 55296+(y0+20)*40+xx,11:next
930 print "{19}{5}":poke 781,4:poke 782,27:poke 783,0:sys 65520:print "NEXT"
940 gosub 700:gosub 950:return
950 poke 781,10:poke 782,27:poke 783,0:sys 65520:print "{5}SCORE";sc;" "
955 poke 781,12:poke 782,27:poke 783,0:sys 65520:print "LINES";li;" "
960 poke 781,14:poke 782,27:poke 783,0:sys 65520:print "LEVEL";lv;" ":return
1000 poke s+4,128:poke s+1,6:poke s+4,129:if sc>hi then hi=sc
1010 poke 781,10:poke 782,16:poke 783,0:sys 65520:print "{18}{28} GAME OVER {146}"
1020 poke 781,12:poke 782,13:poke 783,0:sys 65520:print "{5}PRESS A KEY"
1030 tt=ti+60
1040 if ti<tt then 1040
1050 get k$:if k$<>"" then 1050
1060 get k$:if k$="" then 1060
1070 poke s+4,128:print "{147}":goto 130
