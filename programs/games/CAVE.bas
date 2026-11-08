10 rem *** crystal cave: a text adventure ***
20 poke 53280,0:poke 53281,0:dim ex(8,4),il(4),rn$(8),rd$(8),it$(4)
30 for r=1 to 8:for d=1 to 4:read ex(r,d):next:next
40 data 2,0,0,0,3,1,0,0,4,2,6,0,5,3,0,0,7,4,0,0,8,0,0,3,0,5,0,0,0,6,0,0
50 for r=1 to 8:read rn$(r),rd$(r):next
60 data "FOREST CLEARING","TALL PINES SURROUND YOU. A PATH LEADS NORTH."
70 data "CAVE MOUTH","A DARK CAVE YAWNS IN THE HILLSIDE. DAYLIGHT IS TO THE SOUTH."
80 data "DARK PASSAGE","A NARROW PASSAGE. WATER DRIPS SOMEWHERE. TUNNELS RUN NORTH AND EAST."
90 data "CRYSTAL LAKE","AN UNDERGROUND LAKE GLOWS BLUE. A ROPE BRIDGE LEADS NORTH."
100 data "IRON DOOR","A HEAVY IRON DOOR IS SET INTO THE ROCK TO THE NORTH."
110 data "MINERS' CAMP","AN ABANDONED CAMP WITH RUSTY TOOLS. A GAP LEADS NORTH."
120 data "TREASURE ROOM","GOLD GLITTERS EVERYWHERE! A CROWN SITS ON AN ALTAR."
130 data "SECRET NOOK","A TINY NOOK HIDDEN BEHIND A BOULDER."
140 data "LAMP","KEY","COIN","CROWN"
150 for i=1 to 4:read it$(i):next
160 il(1)=1:il(2)=8:il(3)=6:il(4)=7:rm=1:tr=1:dr=1:mv=0
170 print "{147}{158}   THE CRYSTAL CAVE":print
180 print "{5}FIND THE GOLDEN CROWN AND BRING IT BACK TO THE FOREST CLEARING."
185 print "TYPE HELP FOR COMMANDS."
190 gosub 600
200 print:input "{158}WHAT NOW";a$
210 if a$="" then 200
220 mv=mv+1:sp=0:for i=1 to len(a$):if mid$(a$,i,1)=" " and sp=0 then sp=i
230 next
240 v$=a$:n$="":if sp>0 then v$=left$(a$,sp-1):n$=mid$(a$,sp+1)
250 ni=0:for i=1 to 4:if n$=it$(i) then ni=i
260 next
270 d=0:if v$="GO" then v$=left$(n$,1)
280 if v$="N" or v$="NORTH" then d=1
290 if v$="S" or v$="SOUTH" then d=2
300 if v$="E" or v$="EAST" then d=3
310 if v$="W" or v$="WEST" then d=4
320 if d>0 then 500
330 if v$="LOOK" or v$="L" then gosub 600:goto 200
340 if v$="TAKE" or v$="GET" then 700
350 if v$="DROP" then 750
360 if v$="INV" or v$="I" or v$="INVENTORY" then 800
370 if v$="GIVE" then 850
380 if v$="OPEN" or v$="UNLOCK" then 900
390 if v$="HELP" then 950
400 if v$="QUIT" then print "{147}":end
410 print "{28}I DON'T UNDERSTAND THAT.":goto 200
500 nr=ex(rm,d)
510 if nr=0 then print "{28}YOU CAN'T GO THAT WAY.":goto 200
520 if rm=4 and d=1 and tr=1 then print "{28}A TROLL BLOCKS THE BRIDGE. 'PAY THE TOLL!'":goto 200
530 if rm=5 and d=1 and dr=1 then print "{28}THE IRON DOOR IS LOCKED.":goto 200
540 rm=nr:gosub 600:goto 200
600 print:print "{158}";rn$(rm)
610 if rm>=3 and il(1)<>0 then print "{28}IT IS PITCH DARK. YOU CAN'T SEE.":return
620 print "{5}";rd$(rm)
625 if rm=4 and tr=1 then print "{5}A TROLL GUARDS THE BRIDGE."
626 if rm=5 and dr=1 then print "{5}THE DOOR IS LOCKED."
630 f=0:for i=1 to 4:if il(i)=rm then f=1
635 next
640 if f=0 then return
650 print "{153}YOU SEE:";:for i=1 to 4:if il(i)=rm then print " ";it$(i);
660 next:print:return
700 if ni=0 then print "{28}TAKE WHAT?":goto 200
710 if il(ni)<>rm then print "{28}YOU DON'T SEE THAT HERE.":goto 200
715 if rm>=3 and il(1)<>0 and ni<>1 then print "{28}IT IS TOO DARK.":goto 200
720 il(ni)=0:print "{5}TAKEN.":goto 200
750 if ni=0 or il(ni)<>0 then print "{28}YOU DON'T HAVE THAT.":goto 200
760 il(ni)=rm:print "{5}DROPPED."
770 if rm=1 and il(4)=1 then 1000
780 goto 200
800 f=0:print "{5}YOU ARE CARRYING:";:for i=1 to 4:if il(i)=0 then print " ";it$(i);:f=1
810 next:if f=0 then print " NOTHING";
820 print:goto 200
850 if n$="COIN" and il(3)=0 and rm=4 and tr=1 then tr=0:print "{153}THE TROLL TAKES THE COIN AND STEPS ASIDE.":goto 200
860 print "{28}NOBODY WANTS THAT.":goto 200
900 if rm<>5 or dr=0 then print "{28}THERE IS NOTHING TO OPEN.":goto 200
910 if il(2)<>0 then print "{28}YOU NEED A KEY.":goto 200
920 dr=0:print "{153}THE KEY TURNS. THE DOOR SWINGS OPEN.":goto 200
950 print "{5}COMMANDS: N S E W, GO <DIR>, LOOK,"
955 print "TAKE <ITEM>, DROP <ITEM>, INV,"
960 print "GIVE <ITEM>, OPEN DOOR, HELP, QUIT":goto 200
1000 print:print "{153}YOU PLACE THE GOLDEN CROWN IN THE SUNLIGHT."
1010 print "YOU WIN, IN";mv;"MOVES!":poke 54296,15:poke 54277,9:poke 54276,17:poke 54273,40
1020 print:print "{5}PLAY AGAIN? (Y/N)"
1030 get k$:if k$="" then 1030
1040 if k$="Y" then 160
1050 print "{147}":end
