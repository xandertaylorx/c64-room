10 rem *** tic tac toe ***
20 poke 53280,0:poke 53281,0:dim b(9),w(7,2):s=54272:poke s+24,15:poke s+5,9:poke s+6,0
30 for i=0 to 7:for j=0 to 2:read w(i,j):next:next
40 data 1,2,3,4,5,6,7,8,9,1,4,7,2,5,8,3,6,9,1,5,9,3,5,7
50 pw=0:cw=0:dr=0:fm=0
60 print "{147}{158}":print:print "      T I C   T A C   T O E":print
70 print "{5}   YOU ARE X. THE COMPUTER IS O."
80 print "   PRESS 1-9 TO PLACE YOUR MARK:":print
90 print "{159}        1 2 3":print "        4 5 6":print "        7 8 9":print
95 print "{158}   PRESS ANY KEY"
100 get k$:if k$="" then 100
110 for i=1 to 9:b(i)=0:next:fm=1-fm
120 gosub 600
130 if fm=1 then 300
140 get k$:if k$<"1" or k$>"9" then 140
150 m=val(k$):if b(m)<>0 then 140
160 b(m)=1:gosub 600:gosub 700:if wn<>0 then 400
300 gosub 800:b(m)=2:gosub 600:gosub 700:if wn<>0 then 400
310 goto 140
400 poke 781,17:poke 782,8:poke 783,0:sys 65520
410 if wn=1 then pw=pw+1:print "{18}{153} YOU WIN! {146}":poke s+1,50:poke s+4,17
420 if wn=2 then cw=cw+1:print "{18}{28} I WIN! {146}":poke s+1,10:poke s+4,33
430 if wn=3 then dr=dr+1:print "{18}{158} A DRAW. {146}"
440 poke 781,20:poke 782,6:poke 783,0:sys 65520:print "{5}YOU";pw;" ME";cw;" DRAWS";dr
450 poke 781,22:poke 782,6:poke 783,0:sys 65520:print "PRESS ANY KEY FOR ANOTHER GAME"
460 get k$:if k$="" then 460
470 poke s+4,32:goto 110
600 print "{147}":print:print "      T I C   T A C   T O E":print
610 for r=0 to 2:print "           ";
620 for c=1 to 3:q=r*3+c:if b(q)=0 then print "{159}";mid$(str$(q),2);
630 if b(q)=1 then print "{5}X";
640 if b(q)=2 then print "{158}O";
650 if c<3 then print "{155} {221}{155} ";
660 next:print:if r<2 then print "           {155}{99}{99}{99}{99}{99}{99}{99}"
670 next:return
700 wn=0:for i=0 to 7:a=b(w(i,0)):if a<>0 and a=b(w(i,1)) and a=b(w(i,2)) then wn=a
710 next
720 if wn<>0 then return
730 f=0:for i=1 to 9:if b(i)=0 then f=1
735 next:if f=0 then wn=3
740 return
800 rem computer: win, block, centre, corner, side
810 for p=2 to 1 step -1
820 for i=0 to 7:a=0:e=0:for j=0 to 2:q=w(i,j):if b(q)=p then a=a+1
830 if b(q)=0 then e=q
840 next:if a=2 and e>0 then m=e:return
850 next:next
860 if b(5)=0 then m=5:return
870 for i=1 to 6:q=val(mid$("1379",int(rnd(1)*4)+1,1))
880 if b(q)=0 then m=q:return
890 next
900 for q=1 to 9:if b(q)=0 then m=q:return
910 next
