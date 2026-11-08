10 rem *** blackjack ***
20 poke 53280,5:poke 53281,5:dim d(51),p(10),h(10):cs=100:s=54272
30 poke s+24,15:poke s+5,9:poke s+6,0:r$="A23456789TJQK"
40 s$=chr$(211)+chr$(218)+chr$(193)+chr$(216)
50 print "{147}{158}":print:print "      B L A C K J A C K":print
60 print "{5}   GET CLOSER TO 21 THAN THE DEALER"
70 print "   WITHOUT GOING OVER.":print
80 print "   H = HIT   S = STAND   D = DOUBLE"
90 print "   BLACKJACK PAYS 3 TO 2.":print
100 print "{158}   YOU START WITH $100. PRESS A KEY"
110 get k$:if k$="" then 110
120 print "{147}":if cs<1 then 980
130 print "{158} MONEY: $";cs:print
140 input "{5} YOUR BET";bt$:bt=val(bt$):if bt<1 or bt>cs then print "{28} BET 1 TO";cs:goto 140
150 for i=0 to 51:d(i)=i:next
160 for i=51 to 1 step -1:j=int(rnd(1)*(i+1)):t=d(i):d(i)=d(j):d(j)=t:next
170 nd=0:np=0:nh=0:dbl=0
180 for i=1 to 2:p(np)=d(nd):np=np+1:nd=nd+1:h(nh)=d(nd):nh=nh+1:nd=nd+1:next
190 gosub 800:gosub 830:hd=1:gosub 900
200 if pt=21 then 400
210 print:print "{5} (H)IT  (S)TAND  (D)OUBLE";
220 get k$:if k$<>"H" and k$<>"S" and k$<>"D" then 220
230 if k$="S" then 300
240 if k$="D" and (np>2 or bt*2>cs) then 220
250 if k$="D" then bt=bt*2:dbl=1
260 p(np)=d(nd):np=np+1:nd=nd+1:gosub 800:hd=1:gosub 900
270 if pt>21 then 500
280 if pt=21 or dbl=1 then 300
290 goto 210
300 hd=0:gosub 830:gosub 900
310 if dt>=17 then 340
320 h(nh)=d(nd):nh=nh+1:nd=nd+1:gosub 830:gosub 900:tt=ti+40
330 if ti<tt then 330
335 goto 310
340 if dt>21 then 450
350 if pt>dt then 450
360 if pt<dt then 500
370 print:print "{158} PUSH. YOUR BET IS RETURNED.":goto 600
400 hd=0:gosub 830:gosub 900
410 if dt=21 then print:print "{158} BOTH HAVE BLACKJACK. PUSH.":goto 600
420 print:print "{153} BLACKJACK! PAYS 3 TO 2.":cs=cs+int(bt*1.5):goto 590
450 print:print "{153} YOU WIN $";mid$(str$(bt),2);"!":cs=cs+bt:goto 590
500 print:print "{28} YOU LOSE $";mid$(str$(bt),2);".":cs=cs-bt:poke s+1,6:poke s+4,16:poke s+4,17:goto 600
590 poke s+1,40:poke s+4,16:poke s+4,17
600 print:print "{5} PRESS ANY KEY"
610 get k$:if k$<>"" then 610
620 get k$:if k$="" then 620
630 goto 120
800 pt=0:a=0:for i=0 to np-1:v=p(i)-int(p(i)/13)*13+1:if v>10 then v=10
805 if v=1 then a=a+1:v=11
806 pt=pt+v:next
807 if pt>21 and a>0 then pt=pt-10:a=a-1:goto 807
808 return
830 dt=0:a=0:for i=0 to nh-1:v=h(i)-int(h(i)/13)*13+1:if v>10 then v=10
835 if v=1 then a=a+1:v=11
836 dt=dt+v:next
837 if dt>21 and a>0 then dt=dt-10:a=a-1:goto 837
838 return
900 print "{147}{158} MONEY: $";mid$(str$(cs),2);"  BET: $";bt:print
910 print "{5} DEALER:";
920 for i=0 to nh-1:if hd=1 and i=1 then print " ??";:goto 940
930 c=h(i):gosub 960
940 next:if hd=0 then print "  =";dt
945 print:print:print "{5} YOU:   ";
947 for i=0 to np-1:c=p(i):gosub 960:next:print "{5}  =";pt:return
960 rk=c-int(c/13)*13:su=int(c/13):if su<2 then print "{28}";
962 if su>=2 then print "{5}";
964 print " ";mid$(r$,rk+1,1);mid$(s$,su+1,1);:return
980 print "{147}{28}":print:print " YOU'RE BROKE! GAME OVER.":print
985 print "{5} PRESS ANY KEY TO PLAY AGAIN"
990 get k$:if k$="" then 990
995 cs=100:goto 120
