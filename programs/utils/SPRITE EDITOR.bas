10 rem *** sprite editor ***
20 v=53248:poke 53280,0:poke 53281,0:dim b(23,20)
30 for i=0 to 62:poke 832+i,0:next
40 poke 2040,13:poke v+39,1:poke v+29,1:poke v+23,1:poke v,200:poke v+1,100:poke v+16,1:poke v+21,1
50 gosub 700
60 cx=0:cy=0
70 gosub 800
80 get k$:if k$="" then 80
90 gosub 850
100 if k$="W" and cy>0 then cy=cy-1
110 if k$="S" and cy<20 then cy=cy+1
120 if k$="A" and cx>0 then cx=cx-1
130 if k$="D" and cx<23 then cx=cx+1
140 if k$=" " then b(cx,cy)=1-b(cx,cy):gosub 900
150 if k$="C" then for i=0 to 62:poke 832+i,0:next:for x=0 to 23:for y=0 to 20:b(x,y)=0:next:next:gosub 700
160 if k$="P" then 500
170 if k$="Q" then poke v+21,0:print "{147}":end
180 goto 70
500 print "{147}{5}":poke v+21,0
510 print "SPRITE DATA - COPY IT WITH CTRL/CMD-C:":print "{158}"
520 for r=0 to 8:l$=mid$(str$(1000+r*10),2)+" DATA "
525 for j=0 to 6:l$=l$+mid$(str$(peek(832+r*7+j)),2):if j<6 then l$=l$+","
530 next:print l$:next
540 print "{5}":print "PRESS ANY KEY TO KEEP EDITING"
550 get k$:if k$="" then 550
560 poke v+21,1:gosub 700:goto 70
700 print "{147}{5} W A S D MOVE  SPACE TOGGLE  C CLEAR"
710 print " P PRINT DATA  Q QUIT"
720 for y=0 to 20:for x=0 to 23:poke 1024+(y+3)*40+x+2,46:poke 55296+(y+3)*40+x+2,11:if b(x,y)=1 then poke 1024+(y+3)*40+x+2,160:poke 55296+(y+3)*40+x+2,7
730 next:next:return
800 q=1024+(cy+3)*40+cx+2:poke q,102:poke q+54272,1:return
850 q=1024+(cy+3)*40+cx+2:poke q,46:poke q+54272,11:if b(cx,cy)=1 then poke q,160:poke q+54272,7
860 return
900 byt=832+cy*3+int(cx/8):bit=128/2^(cx and 7)
910 if b(cx,cy)=1 then poke byt,peek(byt) or bit
920 if b(cx,cy)=0 then poke byt,peek(byt) and (255-bit)
930 gosub 850:return
