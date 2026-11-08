10 rem *** hangman ***
20 s=54272:poke 53280,0:poke 53281,0:dim w$(29)
30 for i=0 to 29:read w$(i):next
40 data "COMPUTER","KEYBOARD","JOYSTICK","COMMODORE","SPRITE","CASSETTE","FLOPPY","MONITOR"
50 data "PROGRAM","VARIABLE","ARCADE","CHIPTUNE","BASIC","MACHINE","MEMORY","CURSOR"
60 data "PIXEL","RASTER","BORDER","SCREEN","LOADING","SAVING","DISKETTE","RETURN"
70 data "ADVENTURE","DRAGON","WIZARD","TREASURE","GALAXY","ROCKET"
80 w=0:l=0
90 print "{147}{158}":print:print "       H A N G M A N":print
100 print "{5}   GUESS THE WORD ONE LETTER AT A TIME."
110 print "   SIX WRONG GUESSES AND YOU LOSE.":print:print "{158}   PRESS ANY KEY"
120 get k$:if k$="" then 120
130 print "{147}":wd$=w$(int(rnd(1)*30)):n=len(wd$):g$="":u$="":m=0:rv=0
140 gosub 600:gosub 700
150 get k$:if k$<"A" or k$>"Z" then 150
160 hit=0:for i=1 to n:if mid$(wd$,i,1)=k$ then hit=1
170 next
180 f=0:for i=1 to len(u$):if mid$(u$,i,1)=k$ then f=1
190 next
200 if f=1 then 150
210 u$=u$+k$
220 if hit=0 then m=m+1:poke s+24,15:poke s+1,12:poke s+5,9:poke s+4,33:gosub 600
230 if hit=1 then poke s+1,40:poke s+5,9:poke s+4,17
240 gosub 700:ok=1:for i=1 to n:f=0:for q=1 to len(u$):if mid$(u$,q,1)=mid$(wd$,i,1) then f=1
250 next:if f=0 then ok=0
260 next
270 if ok=1 then 400
280 if m>=6 then 450
290 goto 150
400 poke 781,17:poke 782,8:poke 783,0:sys 65520:print "{18}{153} YOU GOT IT! {146}":w=w+1:goto 500
450 poke 781,17:poke 782,6:poke 783,0:sys 65520:print "{18}{28} THE WORD WAS ";wd$;" {146}":l=l+1
500 poke 781,20:poke 782,5:poke 783,0:sys 65520:print "{5}WON";w;" LOST";l;"  PRESS A KEY FOR NEXT"
510 get k$:if k$="" then 510
520 goto 130
600 rem gallows and body
610 for r=3 to 11:poke 1024+r*40+6,93:poke 55296+r*40+6,12:next
620 for c=6 to 14:poke 1024+3*40+c,64:poke 55296+3*40+c,12:next
630 for c=3 to 10:poke 1024+12*40+c,64:poke 55296+12*40+c,12:next
640 poke 1024+4*40+14,93:poke 55296+4*40+14,12
650 if m>=1 then poke 1024+5*40+14,15:poke 55296+5*40+14,7
660 if m>=2 then poke 1024+6*40+14,93:poke 55296+6*40+14,7
670 if m>=3 then poke 1024+6*40+13,77:poke 55296+6*40+13,7
680 if m>=4 then poke 1024+6*40+15,78:poke 55296+6*40+15,7
685 if m>=5 then poke 1024+7*40+13,78:poke 55296+7*40+13,7
690 if m>=6 then poke 1024+7*40+15,77:poke 55296+7*40+15,7
695 return
700 rem word and used letters
710 poke 781,14:poke 782,4:poke 783,0:sys 65520:print "{5}";
720 for i=1 to n:f=0:for q=1 to len(u$):if mid$(u$,q,1)=mid$(wd$,i,1) then f=1
730 next:if f=1 then print mid$(wd$,i,1);" ";
740 if f=0 then print "- ";
750 next
760 poke 781,16:poke 782,4:poke 783,0:sys 65520:print "{159}USED: ";u$;"            "
770 poke 781,1:poke 782,4:poke 783,0:sys 65520:print "{158}HANGMAN   MISSES:";m
780 return
